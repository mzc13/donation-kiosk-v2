import express from 'express';
import Stripe from 'stripe'
// import fetch from 'node-fetch'

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!,{
  apiVersion: '2020-08-27'
})
const port = Number.parseInt(process.env.KIOSK_PORT!);
const host = '0.0.0.0';

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
  let pm_details = intent.charges.data[0].payment_method_details?.card_present;
  res.send({
    'fingerprint': pm_details?.fingerprint,
    'last4': pm_details?.last4,
    'brand': pm_details?.brand,
    'exp_year': pm_details?.exp_year,
    'exp_month': pm_details?.exp_month
  });
})

app.listen(port, host,() => {
  console.log(`Example app listening at http://0.0.0.0:${port}`)
})