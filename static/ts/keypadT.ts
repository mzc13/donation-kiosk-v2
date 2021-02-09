let btns = {
  "10": document.getElementById("10") as HTMLButtonElement,
  "25": document.getElementById("25") as HTMLButtonElement,
  "50": document.getElementById("50") as HTMLButtonElement,
  "100": document.getElementById("100") as HTMLButtonElement,
  "250": document.getElementById("250") as HTMLButtonElement,
  "500": document.getElementById("500") as HTMLButtonElement,
  "1000": document.getElementById("1000") as HTMLButtonElement,
  other: document.getElementById("other") as HTMLButtonElement,
};
let otherInput = document.getElementById("otherInput") as HTMLInputElement;
let largeDonationNotice = document.getElementById("largeDonationNotice")!;
let selected: keyof typeof btns;
const getKeyValue = <T extends object, U extends keyof T>(key: U) => (obj: T) => obj[key];

function deselectBtn(btn: HTMLElement) {
  btn.classList.remove("btn-selected");
  btn.classList.add("btn-unselected");
}

function selectBtn(id: keyof typeof btns) {
  selected = id;

  for (let btn of Object.values(btns)) {
    deselectBtn(btn);
  }
  let tempBtn = btns[id];
  tempBtn.classList.remove("btn-unselected");
  tempBtn.classList.add("btn-selected");

  if (id == "other") {
    otherInput.classList.remove("hidden");
    otherInput.focus();
  } else {
    largeDonationNotice.classList.add("hidden");
    otherInput.classList.add("hidden");
  }
}

function submit() {
  if (selected != "other") {
    console.log("Success", selected);
    window.location.href = "/static/makepayment.html?donationAmount=" + selected;
  } else {
    let inputVal = otherInput.value;
    let inputFloat = Number.parseFloat(inputVal);
    if (Number.isNaN(inputFloat) || inputFloat < 1) {
      otherInput.classList.remove("focus:ring-purple-600");
      otherInput.classList.add("ring-red-300");
      otherInput.focus();
      return;
    }
    if (inputFloat > 50000) {
      otherInput.value = "50000";
      largeDonationNotice.classList.remove("hidden");
      return;
    }
    window.location.href = "/static/makepayment.html?donationAmount=" + inputFloat.toFixed(2);
  }
}

selectBtn("50");
