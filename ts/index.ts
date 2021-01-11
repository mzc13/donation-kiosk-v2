import express from 'express';
import Stripe from 'stripe'
import mysql from 'mysql2/promise'

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
      capture_method: 'manual',
      description: 'Bayonne Masjid One Time Donation'
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
  res.send({
    'fingerprint': pm_details.fingerprint,
    'last4': pm_details.last4,
    'brand': pm_details.brand,
    'exp_year': pm_details.exp_year,
    'exp_month': pm_details.exp_month
  });
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

app.post('/attach_email', express.json(), async (req, res) => {
  let body = req.body;
  if(body['intentId'] != null && body['email'] != null){
    res.sendStatus(200);
  }else{
    res.sendStatus(400);
    return;
  }
  try{
    let intent = await stripe.paymentIntents.update(body['intentId'], {receipt_email: body['email']});
    let pm_details = intent.charges.data[0].payment_method_details?.card_present;

    let [results, fields] = await pool.query(
      `SELECT customer_id FROM Customer WHERE email = ?`,
      [body['email']]
    );
    if(Array.isArray(results) && results.length > 0){
      await stripe.paymentIntents.update(body['intentId'], {
        // @ts-ignore - customer_id property comes from SQL query
        customer: results[0]['customer_id']
      });
      return;
    }

    let foundCustomer = async (customerId: string) => {
      await stripe.paymentIntents.update(body['intentId'], {customer: customerId});
      await pool.execute(
        `INSERT INTO Customer(customer_id, email) VALUES(?, ?)`,
        [customerId, body['email']]
      );
      await pool.execute(
        `INSERT INTO Uses(customer_id, fingerprint) VALUES(?, ?)`,
        [customerId, pm_details?.fingerprint]
      );
    };

    let customerList = await stripe.customers.list({
      limit: 100,
      // Look for customers created in the last 24 hours
      created: {gte: (Math.floor(Date.now() / 1000)) - (24 * 60 * 60)}
    });
    for(let customer of customerList.data){
      if(customer.email != null && customer.email.toLowerCase() == body['email'].toLowerCase()){
        await foundCustomer(customer.id);
        return;
      }else if(customer.metadata['Email'] != null
        && customer.metadata['Email'].toLowerCase() == body['email'].toLowerCase()){
        await foundCustomer(customer.id);
        return;
      }
    }

    let cardHolderName: string;
    if(pm_details?.cardholder_name != null){
      let splitName = pm_details.cardholder_name.split('/');
      if(splitName.length == 2){
        cardHolderName = splitName[1] + ' ' + splitName[0];
      }else{
        cardHolderName = pm_details.cardholder_name;
      }
    }else{
      cardHolderName = '';
    }

    let customer = await stripe.customers.create({
      description: `${cardHolderName}(${body['email']}) via Donation Kiosk`,
      email: body['email'],
      name: cardHolderName,
      payment_method: (pm_details?.generated_card == null) ? undefined : pm_details.generated_card,
      metadata:{
        'Email': body['email'],
        'Name': cardHolderName
      }
    });
    stripe.paymentIntents.update(intent.id, {
      customer: customer.id
    }).catch((e: Error) => console.error(e));

    await foundCustomer(customer.id);

  }catch(error){
    console.error(error);
  }
})

app.listen(port, host,() => {
  console.log(`Example app listening at http://0.0.0.0:${port}`)
})