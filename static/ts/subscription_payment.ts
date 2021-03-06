import { ErrorResponse, ExposedError, IPaymentIntent, Reader, Terminal } from "@stripe/terminal-js";
import Stripe from "stripe";

const readerLabel = "men";
let pIntent: { intentId: string; client_secret: string } | undefined;

const cancelButton = document.getElementById("cancelButton") as HTMLButtonElement;
const donationAmountField = document.getElementById("donationAmount") as HTMLParagraphElement;

// @ts-ignore - StripeTerminal gets imported from an external script
const terminal: Terminal = StripeTerminal.create({
  onFetchConnectionToken: fetchConnectionToken,
  // TODO Replace this with a function that can actually handle reader disconnect
  onUnexpectedReaderDisconnect: () => subscriptionError("Reader disconnected"),
});

function subscriptionError(message: string, errorObject: ExposedError | null = null) {
  let redirStr = `/static/error.html?message=${message}&transactionType=subscription`;
  if (errorObject != null) {
    redirStr += "&errorObject=" + JSON.stringify(errorObject);
  }
  window.location.replace(redirStr);
}

async function fetchConnectionToken() {
  const response = await fetch("/connection_token", { method: "GET" });
  const data = await response.json();
  return data.secret;
}
async function connectReaderHandler() {
  const discoverResult = await terminal.discoverReaders();
  if ("error" in discoverResult) {
    console.error(discoverResult.error);
    subscriptionError("Failed to discover card reader.");
  } else if (discoverResult.discoveredReaders.length === 0) {
    subscriptionError("No available card readers.");
  } else {
    let selectedReader;
    for (let reader of discoverResult.discoveredReaders) {
      if (reader.label == readerLabel) {
        selectedReader = reader;
        break;
      }
    }
    if (selectedReader == null) {
      subscriptionError("Could not find reader with label " + readerLabel);
    }
    const connectResult = await terminal.connectReader(selectedReader as Reader);
    if ("error" in connectResult) {
      console.error(connectResult.error);
      subscriptionError('Failed to connect to reader with label "' + readerLabel + '"');
    } else {
      console.log("Connected to reader: ", connectResult.reader.label);
    }
  }
}
async function checkout(amount: Number) {
  if (
    terminal.getConnectionStatus() == "not_connected" ||
    terminal.getConnectionStatus() == "connecting"
  ) {
    subscriptionError("Not connected to card reader.");
    return;
  }
  pIntent = await createSubscriptionIntent(amount);
  const cardCaptureResult = await terminal.collectPaymentMethod(pIntent.client_secret);
  if ("error" in cardCaptureResult) {
    subscriptionError(cardCaptureResult.error.message);
    return;
  }
  // The result of processing the payment
  cancelButton.disabled = true;
  const processingResult = await terminal.processPayment(cardCaptureResult.paymentIntent);
  if ("error" in processingResult) {
    subscriptionError(processingResult.error.message);
    return;
  }
  // Notifying your backend to capture result.paymentIntent.id
  if (processingResult.paymentIntent.charges?.data != null) {
    let pm_details = processingResult.paymentIntent.charges.data[0].payment_method_details;
    if (
      pm_details?.card_present?.read_method == "contactless_emv" ||
      pm_details?.card_present?.read_method == "contactless_magstripe_mode"
    ) {
      await processIntent(processingResult.paymentIntent.id);
      window.location.replace(
        `/static/success.html?intentId=${processingResult.paymentIntent.id}&subscriptionFail=true`
      );
    } else {
      console.log(JSON.stringify(pm_details));
      let cardInfo = await loadCardDetails(processingResult.paymentIntent.id);
      window.location.replace(
        "/static/subscription_email.html?" +
          `intentId=${processingResult.paymentIntent.id}` +
          `&fingerprint=${cardInfo["fingerprint"]}` +
          `&last4=${cardInfo["last4"]}` +
          `&exp_month=${cardInfo["exp_month"]}` +
          `&exp_year=${cardInfo["exp_year"]}` +
          `&brand=${cardInfo["brand"]}`
      );
    }
  } else {
    subscriptionError("There was an error processing your card.");
  }
}
// Gets called by cancel button
async function cancelPayment() {
  if (pIntent != null) {
    cancelIntent(pIntent.intentId);
  }
  if (
    terminal.getConnectionStatus() == "not_connected" ||
    terminal.getConnectionStatus() == "connecting"
  ) {
    window.location.replace("/static/index.html");
    return;
  }
  const cancelResult = await terminal.clearReaderDisplay();
  if ("error" in cancelResult) {
    subscriptionError(cancelResult.error.message);
  } else {
    window.location.replace("/static/index.html");
  }
}
async function createSubscriptionIntent(amount: Number) {
  const res = await fetch("/create_subscription_intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"amount":' + amount + "}",
  });
  const data = await res.json();
  return { intentId: data["id"], client_secret: data["client_secret"] };
}
async function processSubscriptionIntent(intentId: string | null | undefined) {
  const res = await fetch("/process_subscription_intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"intentId":"' + intentId + '"}',
  });
  const data: Stripe.Subscription = await res.json();
  return data;
}
async function loadCardDetails(intentId: string | null | undefined) {
  if (intentId == "") return;
  const res = await fetch("/load_card_details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"intentId":"' + intentId + '"}',
  });
  return res.json();
}
async function processIntent(intentId: string | null | undefined) {
  const res = await fetch("/process_intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"intentId":"' + intentId + '"}',
  });
  const data: Stripe.PaymentIntent = await res.json();
  return data;
}
async function cancelIntent(intentId: string) {
  const res = await fetch("/cancel_intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"intentId":"' + intentId + '"}',
  });
  const data: IPaymentIntent | ErrorResponse = await res.json();
  return data;
}

// @ts-ignore - This function gets reused across scripts for multiple pages
function findGetParameter(parameterName: string) {
  let result: string | undefined,
    tmp: string[] = [];
  location.search
    .substr(1)
    .split("&")
    .forEach((item) => {
      tmp = item.split("=");
      if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
    });
  if (result == null || result == "null" || result == "undefined") {
    return "";
  }
  return result;
}

function init() {
  let donationAmountString = findGetParameter("donationAmount");
  if (donationAmountString == null || donationAmountString == "") {
    subscriptionError("No donation amount specified.");
    return;
  }
  let donationAmount = Number.parseInt((Number.parseFloat(donationAmountString) * 100).toFixed());
  connectReaderHandler().then(() => checkout(donationAmount));
  donationAmountField.innerHTML = "$" + (donationAmount / 100).toFixed(2) + " / Month";
  cancelButton.onclick = cancelPayment;
}

init();
