const message = document.getElementById("message") as HTMLDivElement;
const error = document.getElementById("error") as HTMLDivElement;
const header = document.getElementById("header") as HTMLHeadingElement;

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
message.innerText = findGetParameter("message");
error.innerText = findGetParameter("errorObject");

if (findGetParameter("transactionType") == "subscription") {
  header.innerText = "Monthly Donation";
}

setTimeout(() => window.location.replace("/static/index.html"), 10000);
export {};
