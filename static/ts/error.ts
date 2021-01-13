
// // @ts-ignore - This variable gets reused across scripts for multiple pages
// const host = "http://192.168.1.205:49163"
// // @ts-ignore - This variable gets reused across scripts for multiple pages
// const staticHost = host;

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
    if(result == null){
        return ''
    }
    return result;
}
document.getElementById("message")!.innerText = findGetParameter("message");
document.getElementById("error")!.innerText = findGetParameter("errorObject");

setTimeout(() => window.location.replace("/static/index.html"), 10000);