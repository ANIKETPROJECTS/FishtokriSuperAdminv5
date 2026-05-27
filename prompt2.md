# Wallet Payment Integration — Implementation Prompt

This document explains exactly how wallet payments must be structured in the order payload when submitting an order from the customer-facing frontend app to the shared FishTokri backend API. If this is done incorrectly, two things break: the wallet balance is not deducted from the customer's MongoDB document, and the admin panel order detail view does not show "Wallet applied".

---

## The Two Problems (as seen in the admin panel)

**Order created from admin (correct behaviour):**
- Grand Total: ₹200
- "Wallet applied − ₹50" shown below grand total
- "Amount due (cash/UPI): ₹150" shown
- Payment section shows: Wallet ₹50 | Cash ₹150
- Customer's wallet balance in MongoDB is reduced by ₹50

**Order created from frontend app (broken behaviour):**
- Grand Total: ₹500 shown correctly
- No "Wallet applied" line shown at all
- Payment section shows: Unpaid | Paid ₹0 | Due ₹500
- Customer's wallet balance in MongoDB is NOT reduced

---

## Root Cause

The backend deducts the wallet balance by scanning the order's `payments` array for entries where `mode === "wallet"`. The admin view shows "Wallet applied" the same way — by finding an entry in `payments` where `mode === "wallet"`.

If the frontend app does not include the wallet amount as a payment entry with `mode: "wallet"`, neither the deduction nor the display will work.

---

## MongoDB — Where the Wallet Balance Lives

**Database:** `customers`
**Collection:** `customers`

Each customer document has:
```json
{
  "_id": "ObjectId(...)",
  "name": "Aniket Sanjay Rane",
  "phone": "7507219775",
  "walletBalance": 150
}
```

The backend deducts from `walletBalance` using:
```js
db.customers.updateOne(
  { _id: customerId },
  { $inc: { walletBalance: -walletAmountUsed } }
)
```

This deduction only happens if the order's `payments` array contains an entry with `mode: "wallet"` and a positive `amount`.

---

## What the Order Payload Must Look Like

### When wallet is used partially (wallet + cash/UPI)

The customer pays ₹50 from wallet and ₹150 in cash for a ₹200 order:

```json
{
  "customerId": "6a153473b308bc16c243ebe4",
  "customerName": "Aniket Sanjay Rane",
  "phone": "7507219775",
  "items": [...],
  "subtotal": 200,
  "total": 200,
  "discount": 0,
  "slotCharge": 0,
  "paymentStatus": "paid",
  "paidAmount": 200,
  "dueAmount": 0,
  "payments": [
    {
      "mode": "wallet",
      "amount": 50,
      "reference": ""
    },
    {
      "mode": "cash",
      "amount": 150,
      "reference": ""
    }
  ]
}
```

### When wallet fully covers the order

The customer pays ₹200 entirely from wallet:

```json
{
  "customerId": "6a153473b308bc16c243ebe4",
  "paymentStatus": "paid",
  "paidAmount": 200,
  "dueAmount": 0,
  "payments": [
    {
      "mode": "wallet",
      "amount": 200,
      "reference": ""
    }
  ]
}
```

### When wallet is not used (no wallet payment)

Just leave `payments` without a wallet entry. Do not send `{ mode: "wallet", amount: 0 }` — the backend filters out zero-amount entries but it's cleaner to omit them:

```json
{
  "paymentStatus": "unpaid",
  "paidAmount": 0,
  "dueAmount": 200,
  "payments": []
}
```

---

## The `payments` Array — Full Field Reference

Each entry in the `payments` array:

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | string | yes | Payment method. Must be exactly `"wallet"` for wallet payments. Other values: `"cash"`, `"upi"`, `"card"`, `"cod"` |
| `amount` | number | yes | Amount paid via this mode. Must be a positive number. Zero-amount entries are ignored by the backend. |
| `reference` | string | no | Reference number (e.g. UPI transaction ID). Pass `""` if none. |

---

## How `total` vs `paidAmount` vs `dueAmount` Must Be Set

- `total` — the full order amount (subtotal + slotCharge + deliveryCharge − coupon discount). **Do NOT subtract the wallet amount from this.** The wallet is a payment method, not a discount.
- `paidAmount` — sum of all `payments[].amount` values (including wallet). If the order is fully covered: `paidAmount === total`.
- `dueAmount` — `total − paidAmount`. If fully paid: `0`.
- `paymentStatus` — `"paid"` if `paidAmount === total`, `"partial"` if `0 < paidAmount < total`, `"unpaid"` if `paidAmount === 0`.

---

## `customerId` Is Required for Wallet Deduction

The wallet deduction in MongoDB only fires if `customerId` is present in the order payload:

```js
// From the backend — wallet deduction code
const walletPayments = (orderDoc.payments ?? []).filter(p => p.mode === "wallet");
const walletUsed = walletPayments.reduce((sum, p) => sum + Number(p.amount), 0);
if (walletUsed > 0 && customerId) {
  db.customers.updateOne(
    { _id: ObjectId(customerId) },
    { $inc: { walletBalance: -walletUsed } }
  );
}
```

If `customerId` is missing from the payload, the wallet deduction is silently skipped even if `payments` has a wallet entry.

**How to get the customer's MongoDB `_id`:**
- Store it when the customer logs in / registers
- It is the `_id` field from the `customers` collection in the `customers` database
- Pass it as a plain string (the backend converts it to ObjectId internally)

---

## How the Admin Panel Reads Wallet from an Order

The admin order detail view finds the wallet payment like this:

```js
const pays = order.payments ?? [];
const walletPay = pays.find(p => p.mode === "wallet");
const walletUsed = walletPay ? Number(walletPay.amount) : 0;
```

If `walletUsed > 0`, it shows:
- "Wallet applied − ₹X" below the grand total
- "Amount due (cash/UPI): ₹(total − walletUsed)"
- A "Wallet ₹X" row in the payment breakdown

If no entry with `mode: "wallet"` exists in `payments`, none of these lines appear — even if the customer's wallet was supposed to be used.

---

## Checklist Before Submitting an Order with Wallet

- [ ] `customerId` is included and is the correct MongoDB `_id` string of the customer
- [ ] `payments` array contains `{ mode: "wallet", amount: <walletAmountUsed>, reference: "" }`
- [ ] `walletAmountUsed` is `> 0` (do not include zero-amount entries)
- [ ] `walletAmountUsed <= customer.walletBalance` (do not overdraw)
- [ ] `total` is the full order amount, **not** reduced by wallet
- [ ] `paidAmount` = sum of all payment entries (wallet + cash/UPI if any)
- [ ] `dueAmount` = `total − paidAmount`
- [ ] `paymentStatus` = `"paid"` / `"partial"` / `"unpaid"` based on paidAmount vs total

---

## Complete Minimal Working Example

Order: Chicken ₹200 + Fish ₹200 = ₹400 subtotal + ₹100 slot charge = ₹500 total.
Customer pays ₹100 from wallet, ₹400 COD.

```json
{
  "customerId": "6a153473b308bc16c243ebe4",
  "customerName": "Sairaj Koyande",
  "phone": "9619523254",
  "items": [
    { "name": "Chicken", "price": 200, "quantity": 1, "unit": "per kg" },
    { "name": "Fish", "price": 200, "quantity": 1, "unit": "per kg" }
  ],
  "deliveryType": "delivery",
  "address": "205 A Kairali Park, Katemanivali Naka, Kalyan - 400601",
  "deliveryArea": "Kalyan",
  "subHubId": "6a153ecf3f1687ab88db6331",
  "subHubName": "Thane",
  "superHubId": "6a153db93f1687ab88db62e2",
  "superHubName": "Mumbai",
  "subtotal": 400,
  "slotCharge": 100,
  "discount": 0,
  "total": 500,
  "paymentStatus": "paid",
  "paidAmount": 500,
  "dueAmount": 0,
  "payments": [
    { "mode": "wallet", "amount": 100, "reference": "" },
    { "mode": "cod", "amount": 400, "reference": "" }
  ],
  "scheduleType": "slot",
  "deliveryDate": "2026-05-27",
  "timeslotId": "...",
  "timeslotLabel": "3:00 AM - 4:00 AM",
  "timeslotStart": "03:00",
  "timeslotEnd": "04:00"
}
```

After this order is created, the backend will:
1. Deduct ₹100 from `customers.walletBalance` for customer `6a153473b308bc16c243ebe4`
2. Store the full `payments` array in the order document
3. The admin panel will show "Wallet applied − ₹100" and "Amount due (cash/UPI): ₹400"
