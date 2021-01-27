import { ErrorResponse, ExposedError, IPaymentIntent, Reader, Terminal } from "@stripe/terminal-js";
import Stripe from "stripe";

const readerLabel = "women";
let pIntent: { intentId: string; client_secret: string } | undefined;

// @ts-ignore - StripeTerminal gets imported from an external script
const terminal: Terminal = StripeTerminal.create({
  onFetchConnectionToken: fetchConnectionToken,
  // TODO Replace this with a function that can actually handle reader disconnect
  onUnexpectedReaderDisconnect: () => error("Reader disconnected"),
});

function error(message: string, errorObject: ExposedError | null = null) {
  let redirStr = "/static/error.html?message=" + message;
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
    error("Failed to discover card reader.");
  } else if (discoverResult.discoveredReaders.length === 0) {
    error("No available card readers.");
  } else {
    let selectedReader;
    for (let reader of discoverResult.discoveredReaders) {
      if (reader.label == readerLabel) {
        selectedReader = reader;
        break;
      }
    }
    if (selectedReader == null) {
      error("Could not find reader with label " + readerLabel);
    }
    const connectResult = await terminal.connectReader(selectedReader as Reader);
    if ("error" in connectResult) {
      console.error(connectResult.error);
      error('Failed to connect to reader with label "' + readerLabel + '"');
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
    error("Not connected to card reader.");
    return;
  }
  pIntent = await createIntent(amount);
  const cardCaptureResult = await terminal.collectPaymentMethod(pIntent.client_secret);
  if ("error" in cardCaptureResult) {
    error(cardCaptureResult.error.message);
  } else {
    // The result of processing the payment
    // cancelButton.disabled = true;
    const processingResult = await terminal.processPayment(cardCaptureResult.paymentIntent);
    if ("error" in processingResult) {
      error(processingResult.error.message);
    } else {
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
          console.log(
            JSON.stringify(await processSubscriptionIntent(processingResult.paymentIntent.id))
          );
        }
      } else {
        error("There was an error processing your card.");
      }
    }
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
    error(cancelResult.error.message);
  } else {
    window.location.replace("/static/index.html");
  }
}
async function createIntent(amount: Number) {
  const res = await fetch("/create_payment_intent", {
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

connectReaderHandler().then(() => checkout(1000));
