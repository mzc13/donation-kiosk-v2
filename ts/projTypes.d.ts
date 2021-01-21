import Stripe from "stripe";

type CustomerRow = {
  customer_id: string;
  email: string | null;
};
enum CardBrand {
  AMEX = "amex",
  DINERS = "diners",
  DISCOVER = "discover",
  JCB = "jcb",
  MASTERCARD = "mastercard",
  UNIONPAY = "unionpay",
  VISA = "visa",
  UNKNOWN = "unknown",
}
type CardRow = {
  fingerprint: string;
  pm_id: string | null;
  last4: number | null;
  exp_month: number | null;
  exp_year: number | null;
  brand:
    | "amex"
    | "diners"
    | "discover"
    | "jcb"
    | "mastercard"
    | "unionpay"
    | "visa"
    | "unknown"
    | null;
  read_method: Stripe.Charge.PaymentMethodDetails.CardPresent.ReadMethod | "online" | null;
  type: "card" | "card_present" | null;
};
type UsesRow = {
  customer_id: string;
  fingerprint: string;
};
type ReceiptRow = {
  transaction_id: string;
  sent: 0 | 1 | null;
};
type OneTimeEmailReceiptParams = {
  amount_paid: number;
  date_paid: string;
  last4: string; // Must be string to prevent leading zero cutoff
  description: string;
  card_brand:
    | "amex"
    | "diners"
    | "discover"
    | "jcb"
    | "mastercard"
    | "unionpay"
    | "visa"
    | "unknown"
    | string;
  transaction_id: string;
  application_name: string;
  aid: string;
  email_destination: string;
  email_subject: string;
};
