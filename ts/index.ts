import express from "express";
import Stripe from "stripe";
import mysql from "mysql2/promise";
import { createLogger, format, transports } from "winston";
import fetch from "node-fetch";
import { pricesDict, otherProductId } from "./priceDict";
import {
  AmountCarrier,
  CardInfoCarrier,
  IntentIdCarrier,
  OneTimeEmailReceiptParams,
  ReceiptInfoCarrier,
  SubscriptionEmailReceiptParams,
} from "./projTypes";
import dayjs from "dayjs";

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "node-kiosk" },
  transports: [
    //
    // - Write to all logs with level `info` and below to `quick-start-combined.log`.
    // - Write all logs error (and below) to `quick-start-error.log`.
    //
    new transports.File({ filename: "logs/quick-start-error.log", level: "error" }),
    new transports.File({ filename: "logs/quick-start-combined.log" }),
    new transports.File({ filename: "logs/quick-start-http-and-combined.log", level: "http" }),
  ],
});
//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
      level: "debug",
    })
  );
}
let logMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    ips: req.ips,
    body: req.body,
  });
  next();
};

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2020-08-27",
});

const host = process.argv[2];
const port = Number.parseInt(process.argv[3]);

const pool = mysql.createPool({
  host: "db",
  user: "root",
  password: process.env.MYSQL_ROOT_PASSWORD,
  database: "kiosk",
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
});

app.use("/static", express.static("static"));
app.use(express.json());
app.use(logMiddleware);

app.get("/", (req, res) => {
  res.send("Kiosk App Running");
});

let get_token = async (req: express.Request, res: express.Response) => {
  try {
    let token = await stripe.terminal.connectionTokens.create();
    res.send(token);
  } catch (error) {
    res.sendStatus(502);
    logger.error("Error creating connection token", error);
  }
};
app.get("/connection_token", get_token);
app.post("/connection_token", get_token);

app.post("/create_payment_intent", async (req, res) => {
  let body: AmountCarrier = req.body;
  try {
    let intent = await stripe.paymentIntents.create({
      amount: Number.parseInt(body["amount"]),
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "manual",
      description: "Bayonne Masjid One Time Donation",
    });
    res.send(JSON.stringify({ client_secret: intent.client_secret, id: intent.id }));
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error creating PaymentIntent", error);
  }
});

app.post("/process_intent", async (req, res) => {
  let body: IntentIdCarrier = req.body;
  try {
    let intent = await stripe.paymentIntents.update(body["intentId"], {
      description: "Bayonne Masjid One Time Donation",
    });
    intent = await stripe.paymentIntents.capture(intent.id);
    res.send(intent);
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error capturing PaymentIntent", error);
  }
});

app.post("/retrieve_intent", async (req, res) => {
  let body: IntentIdCarrier = req.body;
  try {
    let intent = await stripe.paymentIntents.retrieve(body["intentId"]);
    res.send(intent);
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error retrieving PaymentIntent", error);
  }
});

app.post("/cancel_intent", async (req, res) => {
  let body: IntentIdCarrier = req.body;
  try {
    let intent = await stripe.paymentIntents.cancel(body["intentId"]);
    res.send(intent);
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error canceling PaymentIntent", error);
  }
});

app.post("/load_card_details", async (req, res) => {
  let body: IntentIdCarrier = req.body;
  let intent: Stripe.Response<Stripe.PaymentIntent>;
  try {
    intent = await stripe.paymentIntents.retrieve(body["intentId"]);
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error retrieving PaymentIntent after checkout", error);
    return;
  }
  if (intent.charges.data[0].payment_method_details?.card_present == null) {
    res.sendStatus(400);
    logger.warn("Retrieved PaymentIntent did not have card_present details", {
      intentId: intent.id,
    });
    return;
  }
  let pm_details = intent.charges.data[0].payment_method_details.card_present;
  res.send({
    fingerprint: pm_details.fingerprint,
    last4: pm_details.last4,
    brand: pm_details.brand,
    exp_year: pm_details.exp_year,
    exp_month: pm_details.exp_month,
  });
  pool
    .execute(
      `INSERT INTO Card(fingerprint, pm_id, last4, brand, exp_year, exp_month, read_method, type)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pm_details.fingerprint,
        pm_details.generated_card,
        pm_details.last4,
        pm_details.brand,
        pm_details.exp_year,
        pm_details.exp_month,
        pm_details.read_method,
        "card_present",
      ]
    )
    .catch((e) => {
      if ("code" in e && e.code == "ER_DUP_ENTRY") {
        logger.warn("Duplicate entry when creating new Card in database", {
          sqlMessage: e.sqlMessage,
        });
      } else {
        logger.error("Unexpected error trying to create new Card in database", e);
      }
    });
});

app.post("/find_card_email", (req, res) => {
  let fingerprintQueryLoading = true;
  let heuristicQueryLoading = true;
  let body: CardInfoCarrier = req.body;

  if (body["fingerprint"] != null) {
    pool
      .query(
        `SELECT DISTINCT Customer.email
      FROM Customer INNER JOIN Uses ON Customer.customer_id = Uses.customer_id
        INNER JOIN Card ON Uses.fingerprint = Card.fingerprint
      WHERE Card.fingerprint = ?`,
        [body["fingerprint"]]
      )
      .then(([results, fields]) => {
        fingerprintQueryLoading = false;
        if (res.headersSent == false) {
          if (Array.isArray(results) && results.length > 0) {
            res.send({ emails: results, from: "fingerprint" });
          } else if (heuristicQueryLoading == false) {
            res.sendStatus(502);
          }
        }
      })
      .catch((e: Error) => {
        logger.error("Unexpected error trying to find Customer email from Card fingerprint", e);
      });
  }

  if (
    body["last4"] != null &&
    body["exp_month"] != null &&
    body["exp_year"] != null &&
    body["brand"] != null
  ) {
    pool
      .query(
        `SELECT DISTINCT Customer.email
      FROM Customer INNER JOIN Uses ON Customer.customer_id = Uses.customer_id
        INNER JOIN Card ON Uses.fingerprint = Card.fingerprint
      WHERE Card.last4 = ? AND Card.exp_month = ? AND Card.exp_year = ? AND Card.brand = ?`,
        [body["last4"], body["exp_month"], body["exp_year"], body["brand"]]
      )
      .then(([results, fields]) => {
        heuristicQueryLoading = false;
        if (res.headersSent == false) {
          if (Array.isArray(results) && results.length > 0) {
            res.send({ emails: results, from: "heuristic" });
          } else if (fingerprintQueryLoading == false) {
            res.sendStatus(502);
          }
        }
      })
      .catch((e: Error) => {
        logger.error("Unexpected error trying to find Customer email from Card details", e);
      });
  }

  setTimeout(() => {
    if (res.headersSent == false) {
      res.sendStatus(504);
    }
  }, 3500);
});

/**
 * Function to send email receipt.
 * Do not call this function until payment has been captured to ensure proper information gets sent
 * in receipt.
 * @param intent Stripe PaymentIntent object
 * @param email Destination email for receipt
 * @param pm_details Stripe PaymentMethodDetails for a card present Stripe transaction
 */
async function sendOneTimeEmailReceipt(
  intent: Stripe.PaymentIntent,
  email: string,
  pm_details = intent.charges.data[0].payment_method_details?.card_present
) {
  try {
    pool
      .execute("INSERT INTO Receipt(transaction_id) VALUES(?)", [intent.id])
      .catch((e) => logger.warn("Error adding receipt to database", e));
    let params: OneTimeEmailReceiptParams = {
      amount_paid: intent.amount_received,
      date_paid: new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      last4: pm_details?.last4 == null ? "----" : pm_details.last4, // Must be string to prevent leading zero cutoff
      description: "One Time In Person Donation",
      card_brand: pm_details?.brand == null ? "unknown" : pm_details.brand,
      transaction_id: intent.id,
      application_name:
        pm_details?.receipt?.application_preferred_name == null
          ? ""
          : pm_details.receipt.application_preferred_name,
      aid:
        pm_details?.receipt?.dedicated_file_name == null
          ? ""
          : pm_details.receipt.dedicated_file_name,
      email_destination: email,
      email_subject: "Bayonne Muslims Donation Receipt",
    };
    const res = await fetch("http://email:8080/one-time-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      logger.error("Error trying to send one-time email receipt", res.status);
    }
  } catch (error) {
    logger.error("Unexpected error trying to email one-time receipt", error);
  }
}

async function sendSubscriptionEmailReceipt(
  intent: Stripe.PaymentIntent,
  email: string,
  customerId: string,
  pm_details = intent.charges.data[0].payment_method_details?.card_present
) {
  try {
    pool
      .execute("INSERT INTO Receipt(transaction_id) VALUES(?)", [intent.id])
      .catch((e) => logger.warn("Error adding receipt to database", e));
    let params: SubscriptionEmailReceiptParams = {
      amount_paid: intent.amount_received,
      date_paid: new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      last4: pm_details?.last4 == null ? "----" : pm_details.last4, // Must be string to prevent leading zero cutoff
      description: "Monthly Donation",
      card_brand: pm_details?.brand == null ? "unknown" : pm_details.brand,
      transaction_id: intent.id,
      application_name:
        pm_details?.receipt?.application_preferred_name == null
          ? ""
          : pm_details.receipt.application_preferred_name,
      aid:
        pm_details?.receipt?.dedicated_file_name == null
          ? ""
          : pm_details.receipt.dedicated_file_name,
      email_destination: email,
      email_subject: "Bayonne Muslims Monthly Donation Receipt",
      customer_id: customerId,
    };
    const res = await fetch("http://email:8080/subscription-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      logger.error("Error trying to send subscription email receipt", res.status);
    }
  } catch (error) {
    logger.error("Unexpected error trying to email subscription receipt", error);
  }
}

function duplicateSQLEntry(e: Error | { code: string }) {
  if (
    ("code" in e && e.code == "ER_DUP_ENTRY") ||
    ("message" in e && e.message.includes("Duplicate entry"))
  ) {
    return;
  } else {
    logger.error("Unexpected SQL Error", e);
  }
}

async function findCustomer(
  intent: Stripe.PaymentIntent,
  body: ReceiptInfoCarrier,
  pm_details = intent.charges.data[0].payment_method_details?.card_present
) {
  /**
   * Adds a Customer from Stripe to the local database, and links them with the Card
   * in the payment_method_details specified by pm_details.
   * @param customerId Stripe ID of Customer
   * @param pm_details PaymentMethodDetails of a card_present Stripe transaction.
   * @throws Might throw an SQL Duplicate Entry error if database was modified after
   *    the check in the previous query.
   */
  let foundCustomer = async (
    customerId: string,
    pm_details: Stripe.Charge.PaymentMethodDetails.CardPresent | undefined
  ) => {
    await stripe.paymentIntents.update(body["intentId"], { customer: customerId });
    try {
      await pool.execute(`INSERT INTO Customer(customer_id, email) VALUES(?, ?)`, [
        customerId,
        body["email"],
      ]);
    } catch (error) {
      duplicateSQLEntry(error);
    }
    try {
      await pool.execute(`INSERT INTO Uses(customer_id, fingerprint) VALUES(?, ?)`, [
        customerId,
        pm_details?.fingerprint,
      ]);
    } catch (error) {
      duplicateSQLEntry(error);
    }
  };

  let [
    results,
    fields,
  ] = await pool.query(`SELECT customer_id FROM Customer WHERE Customer.email = ?`, [
    body["email"],
  ]);
  if (Array.isArray(results) && results.length > 0) {
    // @ts-ignore - customer_id property comes from SQL query
    let customerId: string = results[0]["customer_id"];
    await foundCustomer(customerId, pm_details);
    logger.info("Found Customer in database");
    return customerId;
  }

  /*
   * At this point, the Customer isn't in the database so they have to be added.
   * Either, the Customer was created on Stripe within the past 24 hours, after
   * the last time the Customer db update script was run, or they are an entirely
   * new Customer which now has to get added to Stripe.
   */

  let customerList = await stripe.customers.list({
    limit: 100,
    // Look for customers created in the last 24 hours
    created: { gte: Math.floor(Date.now() / 1000) - 24 * 60 * 60 },
  });
  for (let customer of customerList.data) {
    if (customer.email != null && customer.email.toLowerCase() == body["email"].toLowerCase()) {
      await foundCustomer(customer.id, pm_details);
      logger.info("Found Customer on Stripe");
      return customer.id;
    } else if (
      customer.metadata["Email"] != null &&
      customer.metadata["Email"].toLowerCase() == body["email"].toLowerCase()
    ) {
      await foundCustomer(customer.id, pm_details);
      logger.info("Found Customer on Stripe");
      return customer.id;
    }
  }

  let cardHolderName: string;
  if (pm_details?.cardholder_name != null) {
    let splitName = pm_details.cardholder_name.split("/");
    if (splitName.length == 2) {
      cardHolderName = splitName[1] + " " + splitName[0];
    } else {
      cardHolderName = pm_details.cardholder_name;
    }
  } else {
    cardHolderName = "";
  }

  let customer = await stripe.customers.create({
    description: `${cardHolderName}(${body["email"]}) via Donation Kiosk`,
    email: body["email"],
    name: cardHolderName,
    payment_method: pm_details?.generated_card == null ? undefined : pm_details.generated_card,
    metadata: {
      Email: body["email"],
      Name: cardHolderName,
    },
  });
  stripe.paymentIntents
    .update(intent.id, {
      customer: customer.id,
    })
    .catch((e: Error) => console.error(e));

  await foundCustomer(customer.id, pm_details);
  logger.info("Needed to create new Customer");
  return customer.id;
}

app.post("/attach_email", async (req, res) => {
  let body: ReceiptInfoCarrier = req.body;
  if (body["intentId"] != null && body["email"] != null) {
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
    logger.warn("Missing request parameters trying to attach email");
    return;
  }
  try {
    let intent = await stripe.paymentIntents.retrieve(body["intentId"]);
    let pm_details = intent.charges.data[0].payment_method_details?.card_present;

    sendOneTimeEmailReceipt(intent, body["email"]);

    findCustomer(intent, body, pm_details);
  } catch (error) {
    logger.error("Error trying to attach email to PaymentIntent", error);
  }
});

app.post("/create_subscription_intent", async (req, res) => {
  let body: AmountCarrier = req.body;
  try {
    let intent = await stripe.paymentIntents.create({
      amount: Number.parseInt(body["amount"]),
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "manual",
      description: "Bayonne Masjid Monthly Donation",
    });
    res.send(JSON.stringify({ client_secret: intent.client_secret, id: intent.id }));
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error creating PaymentIntent", error);
  }
});

app.post("/attach_subscription_email", async (req, res) => {
  let body: ReceiptInfoCarrier = req.body;
  if (body["intentId"] != null && body["email"] != null) {
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
    logger.warn("Missing request parameters trying to attach email");
    return;
  }

  try {
    let intent = await stripe.paymentIntents.retrieve(body["intentId"]);
    let pm_details = intent.charges.data[0].payment_method_details?.card_present;
    if (pm_details?.generated_card == null) {
      await stripe.paymentIntents.capture(intent.id);
      await findCustomer(intent, body);
      sendOneTimeEmailReceipt(intent, body["email"]);
      return;
    }
    let customerId = await findCustomer(intent, body);
    intent = await stripe.paymentIntents.update(intent.id, {
      customer: customerId,
    });
    await stripe.paymentMethods.attach(pm_details.generated_card, {
      customer: customerId,
    });
    let priceId = pricesDict[intent.amount as keyof typeof pricesDict] as string | undefined;
    let subscriptionItem =
      priceId != null
        ? { price: priceId }
        : {
            price_data: {
              currency: "usd",
              product: otherProductId,
              recurring: { interval: "month" as "month" | "day" | "week" | "year" },
              unit_amount: intent.amount,
            },
          };
    await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: pm_details.generated_card,
      billing_cycle_anchor: dayjs().add(1, "month").unix(),
      off_session: true,
      items: [subscriptionItem],
      proration_behavior: "none",
    });
    intent = await stripe.paymentIntents.capture(intent.id);
    sendSubscriptionEmailReceipt(intent, body["email"], customerId);
  } catch (error) {
    logger.error("Error trying to initiate subscription", error);
  }
});

app.get("/donation-portal/:customerId", async (req, res) => {
  let customerId = req.params["customerId"];
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://bayonnemuslims.com",
    });
    res.redirect(session.url);
  } catch (error) {
    res.sendStatus(400);
    logger.error("Error serving a donation portal page", error);
  }
});

/**
 * Returns the Unix timestamp(in seconds) corresponding to 3 AM on the first Friday of next month.
 * @param now Returned timestamp will be relative to this optional parameter. Defaults to a dayjs
 * object created when the function is called.
 */
function getFirstFridayOfNextMonth(now = dayjs()) {
  let firstDayOfNextMonth = dayjs.unix(getFirstDayOfNextMonth(now));
  let firstFridayOfNextMonth =
    firstDayOfNextMonth.day() == 6 ? firstDayOfNextMonth.day(12) : firstDayOfNextMonth.day(5);
  return firstFridayOfNextMonth.add(3, "hour").unix();
}

/**
 * Returns the Unix timestamp(in seconds) corresponding to 3 AM on the first day of next month.
 * @param now Returned timestamp will be relative to this optional parameter. Defaults to a dayjs
 * object created when the function is called.
 */
function getFirstDayOfNextMonth(now = dayjs()) {
  return now.add(1, "month").startOf("month").add(3, "hour").unix();
}

app.post("/process_subscription_intent", async (req, res) => {
  let intent = await stripe.paymentIntents.update(req.body["intentId"], {
    customer: "cus_Ik29hHUtFBC1kB",
  });
  let pm_details = intent.charges.data[0].payment_method_details;
  if (pm_details?.card_present?.generated_card != null) {
    let pm = await stripe.paymentMethods.attach(pm_details.card_present.generated_card, {
      customer: "cus_Ik29hHUtFBC1kB",
    });
    let subscription = await stripe.subscriptions.create({
      customer: "cus_Ik29hHUtFBC1kB",
      default_payment_method: pm_details.card_present.generated_card,
      items: [{ price: "price_1IBj4CBpNWYY0aYoVy7F0M5i" }],
    });
    res.send(subscription);
  } else {
    res.sendStatus(400);
  }
});

app.listen(port, host, () => {
  logger.info(`App listening at http://${host}:${port}`);
});
