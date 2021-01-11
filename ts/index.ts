import express from 'express';
import Stripe from 'stripe'
import mysql from 'mysql2/promise'
// import fetch from 'node-fetch'

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!,{
  apiVersion: '2020-08-27'
})
const port = Number.parseInt('49163');
const host = '0.0.0.0';

const pool = mysql.createPool({
  host: 'db',
  user: 'root',
  password: 'temp_password',
  database: 'kiosk',
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0
})

app.use('/static', express.static('static'));

app.get('/', (req, res) => {
  res.send('It works');
})

let get_token = async (req: express.Request, res: express.Response) => res.send(await stripe.terminal.connectionTokens.create());
app.get('/connection_token', get_token);
app.post('/connection_token', get_token);

app.post('/create_payment_intent', express.json(), async (req, res) => {
  let intent = await stripe.paymentIntents.create({
    amount: Number.parseInt(req.body['amount']),
    currency: 'usd',
    payment_method_types: ['card_present'],
    capture_method: 'manual'
  });
  res.send(JSON.stringify({client_secret: intent.client_secret, id: intent.id}));
})

app.post('/process_intent', express.json(), async (req, res) => {
  let intent = await stripe.paymentIntents.capture(req.body['intentId']);
  res.send(intent);
})

app.post('/retrieve_intent', express.json(), async (req, res) => {
  res.send(await stripe.paymentIntents.retrieve(req.body['intentId']));
})

app.post('/cancel_intent', express.json(), async (req, res) => {
  let intent = await stripe.paymentIntents.cancel(req.body['intentId']);
  res.send(intent);
})

app.post('/load_card_details', express.json(), async (req, res) => {
  let intent = await stripe.paymentIntents.retrieve(req.body['intentId']);
  if(intent.charges.data[0].payment_method_details?.card_present == null){
    res.sendStatus(400);
    return;
  }
  let pm_details = intent.charges.data[0].payment_method_details.card_present;
  let temp = {
    'fingerprint': pm_details.fingerprint,
    'last4': pm_details.last4,
    'brand': pm_details.brand,
    'exp_year': pm_details.exp_year,
    'exp_month': pm_details.exp_month
  };
  console.log(temp);
  res.send(temp);
  pool.execute(
    `INSERT INTO Card(fingerprint, pm_id, last4, brand, exp_year, exp_month, read_method, type)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [pm_details.fingerprint, pm_details.generated_card, pm_details.last4, pm_details.brand, pm_details.exp_year,
    pm_details.exp_month, pm_details.read_method, 'card_present']
  ).catch((e: Error) => console.error(e.message));
})

app.post('/find_card_email', express.json(), async (req, res) => {
  let fingerprintQueryLoading = true;
  let heuristicQueryLoading = true;
  if(req.body['fingerprint'] != null){
    pool.query(
      `SELECT DISTINCT Customer.email
      FROM Customer INNER JOIN Uses ON Customer.customer_id = Uses.customer_id
        INNER JOIN Card ON Uses.fingerprint = Card.fingerprint
      WHERE Card.fingerprint = ?`,
      [req.body['fingerprint']]
    ).then(([results, fields]) => {
      fingerprintQueryLoading = false;
      if(res.headersSent == false){
        if(Array.isArray(results) && results.length > 0){
          res.send({emails: results});
        }else if(heuristicQueryLoading == false){
          res.sendStatus(502);
        }
      }
    }).catch((e: Error) => console.error(e));
  }
  // if(req.body['last4'] != null && req.body['exp_month'] != null && req.body['exp_year'] != null
  //   && )
})

app.listen(port, host,() => {
  console.log(`Example app listening at http://0.0.0.0:${port}`)
})