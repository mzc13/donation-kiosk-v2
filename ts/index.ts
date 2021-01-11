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
  res.send('Kiosk App Running');
})

let get_token = async (req: express.Request, res: express.Response) => 
  res.send(await stripe.terminal.connectionTokens.create());
app.get('/connection_token', get_token);
app.post('/connection_token', get_token);

app.post('/create_payment_intent', express.json(), async (req, res) => {
  try{
    let intent = await stripe.paymentIntents.create({
      amount: Number.parseInt(req.body['amount']),
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'manual'
    });
    res.send(JSON.stringify({client_secret: intent.client_secret, id: intent.id}));
  }catch(error){
    console.error(error);
    res.sendStatus(400);
  }
})

app.post('/process_intent', express.json(), async (req, res) => {
  try{
    let intent = await stripe.paymentIntents.capture(req.body['intentId']);
    res.send(intent);
  }catch(error){
    console.error(error);
    res.sendStatus(400);
  }
})

app.post('/retrieve_intent', express.json(), async (req, res) => {
  try{
    let intent = await stripe.paymentIntents.retrieve(req.body['intentId']);
    res.send(intent);
  }catch(error){
    console.error(error);
    res.sendStatus(400);
  }
})

app.post('/cancel_intent', express.json(), async (req, res) => {
  try{
    let intent = await stripe.paymentIntents.cancel(req.body['intentId']);
    res.send(intent);
  }catch(error){
    console.error(error);
    res.sendStatus(400);
  }
})

app.post('/load_card_details', express.json(), async (req, res) => {
  let intent: Stripe.Response<Stripe.PaymentIntent>;
  try{
    intent = await stripe.paymentIntents.retrieve(req.body['intentId']);
  }catch(error){
    console.error(error);
    res.sendStatus(400);
    return;
  }
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
  let body = req.body;

  if(body['fingerprint'] != null){
    pool.query(
      `SELECT DISTINCT Customer.email
      FROM Customer INNER JOIN Uses ON Customer.customer_id = Uses.customer_id
        INNER JOIN Card ON Uses.fingerprint = Card.fingerprint
      WHERE Card.fingerprint = ?`,
      [body['fingerprint']]
    ).then(([results, fields]) => {
      fingerprintQueryLoading = false;
      if(res.headersSent == false){
        if(Array.isArray(results) && results.length > 0){
          res.send({emails: results, from: 'fingerprint'});
        }else if(heuristicQueryLoading == false){
          res.sendStatus(502);
        }
      }
    }).catch((e: Error) => console.error(e));
  }

  if(body['last4'] != null && body['exp_month'] != null && body['exp_year'] != null && body['brand'] != null){
    pool.query(
      `SELECT DISTINCT Customer.email
      FROM Customer INNER JOIN Uses ON Customer.customer_id = Uses.customer_id
        INNER JOIN Card ON Uses.fingerprint = Card.fingerprint
      WHERE Card.last4 = ? AND Card.exp_month = ? AND Card.exp_year = ? AND Card.brand = ?`,
      [body['last4'], body['exp_month'], body['exp_year'], body['brand']]
    ).then(([results, fields]) => {
      heuristicQueryLoading = false;
      if(res.headersSent == false){
        if(Array.isArray(results) && results.length > 0){
          res.send({emails: results, from: 'heuristic'});
        }else if(fingerprintQueryLoading == false){
          res.sendStatus(502);
        }
      }
    }).catch((e: Error) => console.error(e));
  }

  setTimeout(() => {
    if(res.headersSent == false){
      res.sendStatus(504);
    }
  }, 3500);
})

app.listen(port, host,() => {
  console.log(`Example app listening at http://0.0.0.0:${port}`)
})