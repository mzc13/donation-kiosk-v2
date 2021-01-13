let emailOptions: Array<{ id: string; element: HTMLButtonElement }> = [];
let emailBtns = document.getElementById("btn-grp") as HTMLDivElement;
let otherEmailInput = document.getElementById("otherInput") as HTMLInputElement;
let selectedEmail = "other";

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

async function getEmails() {
  const res = await fetch("/find_card_email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fingerprint: findGetParameter("fingerprint"),
      last4: findGetParameter("last4"),
      exp_month: findGetParameter("exp_month"),
      exp_year: findGetParameter("exp_year"),
      brand: findGetParameter("brand"),
    }),
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  let emails: Array<{ email: string }> = data["emails"];
  return emails;
}

async function loadEmailButtons() {
  let emails = await getEmails();
  if (emails.length == 0) return;
  for (let emailObject of emails) {
    let email = emailObject.email;
    let btn = document.createElement("button");
    btn.innerText = email;
    btn.id = email;
    btn.classList.add("email-btn-unselected");
    btn.onclick = () => selectEmail(email);
    emailBtns.appendChild(btn);
    emailOptions.push({ id: email, element: btn });
  }
  let btn = document.createElement("button");
  btn.innerText = "Other Email";
  btn.id = "other";
  btn.classList.add("email-btn-unselected");
  btn.onclick = () => selectEmail("other");
  emailBtns.appendChild(btn);
  emailOptions.push({ id: "other", element: btn });

  selectEmail("other");
}

function selectEmail(btnId: string) {
  let tempBtn: HTMLButtonElement | null = null;
  for (let btnObject of emailOptions) {
    btnObject.element.classList.remove("email-btn-selected");
    btnObject.element.classList.add("email-btn-unselected");
    if (btnObject.id == btnId) {
      tempBtn = btnObject.element;
    }
  }
  if (tempBtn == null) return;
  selectedEmail = tempBtn.id;
  tempBtn.classList.remove("email-btn-unselected");
  tempBtn.classList.add("email-btn-selected");

  if (selectedEmail == "other") {
    otherEmailInput.classList.remove("hidden");
    otherEmailInput.focus();
  } else {
    otherEmailInput.classList.add("hidden");
  }
}

async function finish() {
  let attachEmail = async (email: string) => {
    await fetch("/attach_email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        intentId: findGetParameter("intentId"),
      }),
    });
  };
  if (selectedEmail != "other") {
    attachEmail(selectedEmail);
  } else if (otherEmailInput.value.trim() != "") {
    attachEmail(otherEmailInput.value.trim());
  }
  clearTimeout(timeout);
  window.location.replace("/static/index.html");
}

loadEmailButtons();
let timeout = setTimeout(() => window.location.replace("/static/index.html"), 120000);
