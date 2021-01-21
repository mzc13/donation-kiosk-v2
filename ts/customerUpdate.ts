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
  "Card ID": string;
  "Card Last4": string;
  "Card Brand": string;
  "Card Exp Month": string;
  "Card Exp Year": string;
  //   "Card Name": string;
  "Card Fingerprint": string;
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
  console.log(row);
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
        "card",
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

let chArray: Array<ChargeRow> = [];
fs.createReadStream(process.argv[2])
  .pipe(csv())
  .on("data", (row: ChargeRow) => chArray.push(row))
  .on("end", async () => {
    for (let row of chArray) {
      if (row["Customer ID"] != null && row["Customer ID"] != "") {
        if (row["Customer Email"] != null && row["Customer Email"] != "") {
          addChargeToDb(row);
        } else {
          let cust = await stripe.customers.retrieve(row["Customer ID"]);
          if (
            "metadata" in cust &&
            cust.metadata["Email"] != null &&
            cust.metadata["Email"] != ""
          ) {
            row["Customer Email"] = cust.metadata["Email"];
            addChargeToDb(row);
            await stripe.customers.update(cust.id, {
              email: row["Customer Email"],
            });
          }
          await sleep(100);
        }
      }
    }
  });
