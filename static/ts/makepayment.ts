import {ErrorResponse, ExposedError, IPaymentIntent, Reader, Terminal} from '@stripe/terminal-js';

// @ts-ignore
const host = "http://192.168.1.205:49163"
// @ts-ignore
const staticHost = host;
const readerLabel = "women"
let pIntent : {intentId: string, client_secret: string} | undefined;

const cancelButton = document.getElementById("cancelButton") as HTMLButtonElement;
const donationAmountField = document.getElementById("donationAmount")!;

// @ts-ignore
const terminal : Terminal = StripeTerminal.create({
    onFetchConnectionToken: fetchConnectionToken,
    // TODO Replace this with a function that can actually handle reader disconnect
    onUnexpectedReaderDisconnect: () => error("Reader disconnected"),
});;

// TODO Modify this function and remove the debugging part
function error(message: string, errorObject: ExposedError | null = null){
    let redirStr = staticHost + "/static/error.html?message=" + message;
    if(errorObject != null){
        redirStr += "&errorObject=" + JSON.stringify(errorObject);
    }
    window.location.replace(redirStr);
}

async function fetchConnectionToken() {
    const response = await fetch(host + '/connection_token', { method: "GET" });
    const data = await response.json();
    return data.secret;
}
async function connectReaderHandler() {
    const discoverResult = await terminal.discoverReaders();
    if ('error' in discoverResult) {
        console.error(discoverResult.error);
        error("Failed to discover card reader.");
    } else if (discoverResult.discoveredReaders.length === 0) {
        error("No available card readers.");
    } else {
        let selectedReader;
        for(let reader of discoverResult.discoveredReaders){
            if(reader.label == readerLabel){
                selectedReader = reader;
                break;
            }
        }
        if(selectedReader == null){
            error("Could not find reader with label " + readerLabel);
        }
        const connectResult = await terminal.connectReader(selectedReader as Reader);
        if ('error' in connectResult) {
            console.error(connectResult.error);
            error('Failed to connect to reader with label "' + readerLabel + '"');
        } else {
            console.log('Connected to reader: ', connectResult.reader.label);
        }
    }
}
async function checkout(amount: Number){
    if(terminal.getConnectionStatus() == "not_connected"
        || terminal.getConnectionStatus() == "connecting"){
        error("Not connected to card reader.");
        return;
    }
    pIntent = await createIntent(amount);
    const cardCaptureResult = await terminal.collectPaymentMethod(pIntent.client_secret);
    if('error' in cardCaptureResult){
        error(cardCaptureResult.error.message);
    }else{
        // The result of processing the payment
        cancelButton.disabled = true;
        const processingResult = await terminal.processPayment(cardCaptureResult.paymentIntent);
        if ('error' in processingResult) {
            error(processingResult.error.message);
        } else {
            // Notifying your backend to capture result.paymentIntent.id
            await processIntent(processingResult.paymentIntent.id);
            window.location.replace(staticHost + "/static/success.html?intentId=" + processingResult.paymentIntent.id);
        }
    }
}
// Gets called by cancel button
async function cancelPayment(){
    if(pIntent != null){
        cancelIntent(pIntent.intentId);
    }
    if(terminal.getConnectionStatus() == "not_connected"
        || terminal.getConnectionStatus() == "connecting"){
        window.location.replace(staticHost + "/static/index.html");
        return;
    }
    const cancelResult = await terminal.clearReaderDisplay();
    if('error' in cancelResult){
        error(cancelResult.error.message);
    }else{
        window.location.replace(staticHost + "/static/index.html");
    }
}
async function createIntent(amount: Number){
    const res = await fetch(host + '/create_payment_intent', {
        method:'POST',
        headers:{'Content-Type': 'application/json'},
        body:'{"amount":' + amount + '}'
    });
    const data = await res.json();
    return {'intentId': data['id'], 'client_secret': data['client_secret']};
}
async function processIntent(intentId: string | null | undefined){
    const res = await fetch(host + '/process_intent', {
        method:'POST',
        headers:{'Content-Type': 'application/json'},
        body:'{"intentId":"' + intentId + '"}'
    });
    const data : IPaymentIntent = await res.json();
    return data;
}
async function cancelIntent(intentId: string){
    const res = await fetch(host + '/cancel_intent', {
        method:'POST',
        headers:{'Content-Type': 'application/json'},
        body:'{"intentId":"' + intentId + '"}'
    });
    const data : IPaymentIntent | ErrorResponse = await res.json();
    return data;
}
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
    return result;
}

function init(){
    let donationAmountString = findGetParameter("donationAmount");
    if(donationAmountString == null){
        error("No donation amount specified.");
    }
    let donationAmount = Number.parseInt((Number.parseFloat(donationAmountString!)*100).toFixed());
    connectReaderHandler().then(() => checkout(donationAmount));
    donationAmountField.innerHTML = "$" + (donationAmount / 100).toFixed(2);
    cancelButton.onclick = cancelPayment;
}

init();