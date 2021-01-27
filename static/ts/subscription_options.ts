let subscription_btns = {
  "15": document.getElementById("15") as HTMLButtonElement,
  "30": document.getElementById("30") as HTMLButtonElement,
  "60": document.getElementById("60") as HTMLButtonElement,
  "90": document.getElementById("90") as HTMLButtonElement,
  "120": document.getElementById("120") as HTMLButtonElement,
  "150": document.getElementById("150") as HTMLButtonElement,
  "180": document.getElementById("180") as HTMLButtonElement,
  other: document.getElementById("other") as HTMLButtonElement,
};
let subscription_otherInput = document.getElementById("otherInput") as HTMLInputElement;
let subscription_largeDonationNotice = document.getElementById(
  "largeDonationNotice"
) as HTMLParagraphElement;
let subscription_selected: keyof typeof subscription_btns;
const subscription_getKeyValue = <T extends object, U extends keyof T>(key: U) => (obj: T) =>
  obj[key];

function subscription_deselectBtn(btn: HTMLElement) {
  btn.classList.remove("btn-selected");
  btn.classList.add("btn-unselected");
}

function subscription_selectBtn(id: keyof typeof subscription_btns) {
  subscription_selected = id;

  for (let btn of Object.values(subscription_btns)) {
    subscription_deselectBtn(btn);
  }
  let tempBtn = subscription_btns[id];
  tempBtn.classList.remove("btn-unselected");
  tempBtn.classList.add("btn-selected");

  if (id == "other") {
    subscription_otherInput.classList.remove("hidden");
    subscription_otherInput.focus();
  } else {
    subscription_largeDonationNotice.classList.add("hidden");
    subscription_otherInput.classList.add("hidden");
  }
}

function subscription_submit() {
  if (subscription_selected != "other") {
    console.log("Success", subscription_selected);
    window.location.href =
      "/static/subscription_payment.html?donationAmount=" + subscription_selected;
  } else {
    let inputVal = subscription_otherInput.value;
    let inputFloat = Number.parseFloat(inputVal);
    if (Number.isNaN(inputFloat) || inputFloat < 1) {
      subscription_otherInput.classList.remove("focus:ring-purple-600");
      subscription_otherInput.classList.add("ring-red-300");
      subscription_otherInput.focus();
      return;
    }
    if (inputFloat > 1000) {
      subscription_otherInput.value = "1000";
      subscription_largeDonationNotice.classList.remove("hidden");
      return;
    }
    window.location.href =
      "/static/subscription_payment.html?donationAmount=" + inputFloat.toFixed(2);
  }
}

let init = () => {
  for (let key of Object.keys(subscription_btns)) {
    let btn = subscription_btns[key as keyof typeof subscription_btns];
    btn.onclick = () => subscription_selectBtn(key as keyof typeof subscription_btns);
  }
  subscription_selectBtn("30");
};

init();
