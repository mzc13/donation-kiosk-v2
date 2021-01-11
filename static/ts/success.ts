
// @ts-ignore - This variable gets reused across scripts for multiple pages
const host = "http://192.168.1.205:49163"
// @ts-ignore - This variable gets reused across scripts for multiple pages
const staticHost = host;

const yesButton = document.getElementById('yesButton') as HTMLButtonElement;
const noButton = document.getElementById('noButton') as HTMLButtonElement;

let fingerprint = '';
let brand = '';
let last4 = '';
let expMonth = '';
let expYear = '';

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

async function loadCardDetails(intentId: string){
    if(intentId == '') return;
    const res = await fetch(host + '/load_card_details', {
        method:'POST',
        headers:{'Content-Type': 'application/json'},
        body:'{"intentId":"' + intentId + '"}'
    });
    const data = await res.json();
    fingerprint = data['fingerprint'];
    last4 = data['last4'];
    brand = data['brand'];
    expYear = data['exp_year'];
    expMonth = data['exp_month'];
}

async function yesAction(){
    const res = await fetch(host + '/find_card_email', {
        method:'POST',
        headers:{'Content-Type': 'application/json'},
        body: JSON.stringify({
            'fingerprint': fingerprint,
            'last4': last4,
            'exp_month': expMonth,
            'exp_year': expYear,
            'brand': brand
        })
    });
    const data = await res.json();
    console.log(data);
}

function noAction(){

}

yesButton.onclick = yesAction;
noButton.onclick = noAction;

loadCardDetails(findGetParameter('intentId'));