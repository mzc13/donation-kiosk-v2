import Stripe from "stripe";
import mysql from "mysql2/promise";
import csv from "csv-parser";
import fs from "fs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2020-08-27",
});

const pool = mysql.createPool({
  host: "db",
  user: "root",
  password: process.env.MYSQL_ROOT_PASSWORD,
  database: "kiosk",
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
});

interface ChargeRow {
  //   id: string;
  "Customer ID": string;
  "Customer Email": string;
  "Card ID": string | null;
  "Card Last4": string | null;
  "Card Brand": string | null;
  "Card Exp Month": string | number | null;
  "Card Exp Year": string | number | null;
  //   "Card Name": string;
  "Card Fingerprint": string | null;
  Type: string | null | undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function duplicateSQLEntry(e: Error | { code: string }) {
  if (
    ("code" in e && e.code == "ER_DUP_ENTRY") ||
    ("message" in e && e.message.includes("Duplicate entry"))
  ) {
    return;
  } else {
    console.error(e);
  }
}

async function addChargeToDb(row: ChargeRow) {
  try {
    await pool.execute(`INSERT INTO Customer(customer_id, email) VALUES(?, ?)`, [
      row["Customer ID"],
      row["Customer Email"],
    ]);
  } catch (error) {
    duplicateSQLEntry(error);
  }
  try {
    await pool.execute(
      `INSERT INTO Card(fingerprint, pm_id, last4, exp_month, exp_year, brand, read_method, type)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row["Card Fingerprint"],
        row["Card ID"],
        row["Card Last4"],
        row["Card Exp Month"],
        row["Card Exp Year"],
        row["Card Brand"] == "American Express" ? "amex" : row["Card Brand"],
        "online",
        row["Type"],
      ]
    );
  } catch (error) {
    duplicateSQLEntry(error);
  }
  try {
    await pool.execute(`INSERT INTO Uses(customer_id, fingerprint) VALUES(?, ?)`, [
      row["Customer ID"],
      row["Card Fingerprint"],
    ]);
  } catch (error) {
    duplicateSQLEntry(error);
  }
}

const stripe2 = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2020-08-27",
});

let updateCharges = async () => {
  let charges = await stripe2.charges.list({
    limit: 100,
    created: {
      // Charges created in the last 24 hours
      gte: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
    },
  });
  for (let cData of charges.data) {
    await sleep(100);
    if (typeof cData.customer === "string") {
      let cust = await stripe2.customers.retrieve(cData.customer);
      if (
        cust.deleted == true ||
        cData.payment_method_details?.card == null ||
        cData.payment_method_details.card.fingerprint == null
      ) {
        continue;
      }
      if (cust.email != null && cust.email != "") {
        addChargeToDb({
          "Customer ID": cust.id,
          "Customer Email": cust.email,
          "Card ID": cData.payment_method,
          "Card Last4": cData.payment_method_details.card.last4,
          "Card Brand": cData.payment_method_details.card.brand,
          "Card Exp Month": cData.payment_method_details.card.exp_month,
          "Card Exp Year": cData.payment_method_details.card.exp_year,
          "Card Fingerprint": cData.payment_method_details.card.fingerprint,
          Type: cData.payment_method_details.type,
        });
      } else {
        if ("metadata" in cust && cust.metadata["Email"] != null && cust.metadata["Email"] != "") {
          addChargeToDb({
            "Customer ID": cust.id,
            "Customer Email": cust.metadata["Email"],
            "Card ID": cData.payment_method,
            "Card Last4": cData.payment_method_details.card.last4,
            "Card Brand": cData.payment_method_details.card.brand,
            "Card Exp Month": cData.payment_method_details.card.exp_month,
            "Card Exp Year": cData.payment_method_details.card.exp_year,
            "Card Fingerprint": cData.payment_method_details.card.fingerprint,
            Type: cData.payment_method_details.type,
          });
          await stripe.customers.update(cust.id, {
            email: cust.metadata["Email"],
          });
        }
      }
    }
  }
};

updateCharges().then(() => process.exit(0));
