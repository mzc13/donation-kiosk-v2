const yesButton = document.getElementById("yesButton") as HTMLButtonElement;
const noButton = document.getElementById("noButton") as HTMLButtonElement;

let intentId = findGetParameter("intentId");
let fingerprint = "";
let brand = "";
let last4 = "";
let expMonth = "";
let expYear = "";

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
  if (result == null) {
    return "";
  }
  return result;
}

async function loadCardDetails(intentId: string) {
  if (intentId == "") return;
  const res = await fetch("/load_card_details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"intentId":"' + intentId + '"}',
  });
  const data = await res.json();
  fingerprint = data["fingerprint"];
  last4 = data["last4"];
  brand = data["brand"];
  expYear = data["exp_year"];
  expMonth = data["exp_month"];
}

async function yesAction() {
  window.location.replace(
    `/static/receipt.html?` +
      `intentId=${intentId}&fingerprint=${fingerprint}&last4=${last4}&exp_month=${expMonth}&exp_year=${expYear}&brand=${brand}`
  );
}

function noAction() {
  window.location.replace("/static/index.html");
}

yesButton.onclick = yesAction;
noButton.onclick = noAction;

loadCardDetails(intentId);
