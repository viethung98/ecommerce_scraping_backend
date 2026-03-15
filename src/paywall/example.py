"""
x402 Payment Server using pypolkadot light client.

Run: python server.py
"""

import json
from flask import Flask, request, jsonify, Response
from pypolkadot import LightClient

app = Flask(__name__)

# Payment configuration
RECIPIENT = "114GfgcSW7cmvz3fZeabwJt9o6NUAfCYmWAZ6yF2HnQYGje"  # Your SS58 address
PRICE_PLANCK = 1_000_000_000  # 0.1 PAS (10 decimals on Asset Hub Paseo)
NETWORK = "paseo"

# Lazy-init light client
_client = None


def get_client():
  global _client
  if _client is None:
      print(f"[INIT] Initializing light client for {NETWORK}...")
      _client = LightClient(network=NETWORK)
      block = _client.get_finalized_block()
      print(f"[INIT] Light client ready! Latest block: #{block.number} ({block.hash})")
  return _client


def bytes_to_hex(value) -> str | None:
  """Convert various byte representations to hex string."""
  # Handle nested list like [[1, 2, 3, ...]]
  if isinstance(value, list):
      if len(value) == 1 and isinstance(value[0], list):
          value = value[0]
      if all(isinstance(b, int) for b in value):
          return "0x" + bytes(value).hex()
  # Already a hex string
  if isinstance(value, str) and (value.startswith("0x") or len(value) == 64):
      return value if value.startswith("0x") else "0x" + value
  return None


def ss58_to_hex(ss58_address: str) -> str | None:
  """Convert SS58 address to hex using the light client's storage query trick."""
  # We can use base58 decoding manually
  import base58
  try:
      decoded = base58.b58decode(ss58_address)
      # SS58 format: [prefix(1-2 bytes)][pubkey(32 bytes)][checksum(2 bytes)]
      if len(decoded) == 35:  # 1-byte prefix
          pubkey = decoded[1:33]
      elif len(decoded) == 36:  # 2-byte prefix
          pubkey = decoded[2:34]
      else:
          return None
      return "0x" + pubkey.hex()
  except Exception as e:
      print(f"[WARN] Failed to decode SS58 {ss58_address}: {e}")
      return None


def verify_payment(block_hash: str, recipient: str, min_amount: int) -> dict | None:
  """Verify a payment exists in the given block."""
  client = get_client()

  print(f"\n[VERIFY] Looking for payment in block: {block_hash}")
  print(f"[VERIFY] Expected recipient (SS58): {recipient}")

  # Convert recipient to hex for comparison
  recipient_hex = ss58_to_hex(recipient)
  print(f"[VERIFY] Expected recipient (hex): {recipient_hex}")
  print(f"[VERIFY] Minimum amount: {min_amount}")

  # Get transfer events
  transfers = client.events(block_hash=block_hash, pallet="Balances", name="Transfer")
  print(f"[VERIFY] Found {len(transfers)} Balances.Transfer events")

  for i, t in enumerate(transfers):
      print(f"\n[VERIFY] Transfer #{i}:")
      print(f"  Raw fields: {t.fields}")

      # Extract and convert fields
      to_raw = t.fields.get("to")
      from_raw = t.fields.get("from")
      amount = t.fields.get("amount", 0)

      to_hex = bytes_to_hex(to_raw)
      from_hex = bytes_to_hex(from_raw)

      print(f"  from (hex): {from_hex}")
      print(f"  to (hex): {to_hex}")
      print(f"  amount: {amount}")

      # Compare hex addresses
      match = to_hex and recipient_hex and to_hex.lower() == recipient_hex.lower()
      print(f"  Match: {to_hex} == {recipient_hex}: {match}")
      print(f"  Amount ok: {amount} >= {min_amount}: {amount >= min_amount}")

      if match and amount >= min_amount:
          print(f"[VERIFY] MATCH FOUND!")
          return {
              "from": from_hex,
              "to": to_hex,
              "to_ss58": recipient,
              "amount": amount,
              "block_hash": block_hash,
          }

  print(f"[VERIFY] No matching transfer found")
  return None


@app.route("/premium")
def premium_content():
  """Protected endpoint requiring x402 payment."""

  payment_header = request.headers.get("X-Payment")
  print(f"\n[REQUEST] /premium - X-Payment header: {payment_header}")

  if not payment_header:
      print(f"[REQUEST] No payment header, returning 402")
      return Response(
          json.dumps({
              "error": "Payment Required",
              "payment": {
                  "network": "paseo-asset-hub",
                  "recipient": RECIPIENT,
                  "amount": PRICE_PLANCK,
                  "currency": "PAS",
                  "instructions": "Submit Balances.transfer_keep_alive, then retry with X-Payment: block=0x..."
              }
          }, indent=2),
          status=402,
          mimetype="application/json",
          headers={"X-Payment-Required": f"recipient={RECIPIENT};amount={PRICE_PLANCK}"}
      )

  # Parse payment proof
  try:
      block_hash = payment_header.split("block=")[1].split(";")[0].strip()
      print(f"[REQUEST] Parsed block hash: {block_hash}")
  except (IndexError, AttributeError) as e:
      print(f"[REQUEST] Failed to parse header: {e}")
      return jsonify({"error": "Invalid X-Payment header format. Use: block=0x..."}), 400

  # Verify payment on-chain
  payment = verify_payment(block_hash, RECIPIENT, PRICE_PLANCK)

  if not payment:
      return jsonify({
          "error": "Payment not found",
          "details": f"No transfer of >= {PRICE_PLANCK} to {RECIPIENT} in block {block_hash}",
      }), 402

  print(f"[REQUEST] Payment verified!")
  return jsonify({
      "content": "This is the premium content you paid for!",
      "payment_verified": payment,
  })


@app.route("/health")
def health():
  """Health check."""
  client = get_client()
  block = client.get_finalized_block()
  return jsonify({
      "status": "ok",
      "network": NETWORK,
      "latest_block": block.number,
      "recipient": RECIPIENT,
      "recipient_hex": ss58_to_hex(RECIPIENT),
      "price": PRICE_PLANCK,
  })


@app.route("/debug/<block_hash>")
def debug_block(block_hash):
  """Debug endpoint to inspect a block's events."""
  client = get_client()

  all_events = client.events(block_hash=block_hash)

  events_list = []
  for e in all_events:
      fields = dict(e.fields) if isinstance(e.fields, dict) else e.fields
      # Convert any byte arrays in fields
      if isinstance(fields, dict):
          for k, v in fields.items():
              hex_val = bytes_to_hex(v)
              if hex_val:
                  fields[k] = hex_val
      events_list.append({
          "index": e.index,
          "pallet": e.pallet,
          "name": e.name,
          "fields": fields,
      })

  return jsonify({
      "block_hash": block_hash,
      "total_events": len(all_events),
      "events": events_list,
  })


if __name__ == "__main__":
  print(f"[START] x402 Payment Server")
  print(f"[START] Network: {NETWORK}")
  print(f"[START] Recipient: {RECIPIENT}")
  print(f"[START] Recipient (hex): {ss58_to_hex(RECIPIENT)}")
  print(f"[START] Price: {PRICE_PLANCK} planck")
  app.run(port=5402, debug=True)