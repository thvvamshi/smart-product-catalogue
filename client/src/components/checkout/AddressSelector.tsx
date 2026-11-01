import { useState, type FormEvent } from "react";
import { createAddress } from "../../lib/api";
import type { Address } from "../../types/commerce";
import type { CustomerLocation } from "../../types/location";
export function AddressSelector({
  addresses,
  value,
  location,
  onChange,
  onCreated,
}: {
  addresses: Address[];
  value: string;
  location: CustomerLocation | null;
  onChange: (id: string) => void;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(!addresses.length),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!location) {
      setError("Select a delivery location before saving an address.");
      return;
    }
    const data = new FormData(event.currentTarget);
    try {
      const result = await createAddress({
        label: String(data.get("label")),
        recipientName: String(data.get("recipientName")),
        phone: String(data.get("phone")),
        addressLine1: String(data.get("addressLine1")),
        addressLine2: String(data.get("addressLine2")),
        city: location.city,
        state: "Telangana",
        postalCode: location.postalCode || String(data.get("postalCode")),
        latitude: location.latitude,
        longitude: location.longitude,
        isDefault: true,
      });
      await onCreated();
      onChange(result.data.id);
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save address",
      );
    }
  };
  return (
    <section className="address-selector">
      <h2>Delivery address</h2>
      {addresses.length ? (
        <select
          aria-label="Delivery address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {addresses.map((address) => (
            <option value={address.id} key={address.id}>
              {address.label} — {address.addressLine1}
            </option>
          ))}
        </select>
      ) : null}
      <button onClick={() => setOpen((current) => !current)}>
        {open ? "Cancel" : "Add address"}
      </button>
      {open ? (
        <form onSubmit={submit} className="address-form">
          <label>
            Label
            <input name="label" defaultValue="Home" required />
          </label>
          <label>
            Recipient name
            <input name="recipientName" required />
          </label>
          <label>
            Phone
            <input name="phone" inputMode="tel" required />
          </label>
          <label>
            Address line
            <input name="addressLine1" required />
          </label>
          <label>
            Address line 2<input name="addressLine2" />
          </label>
          <label>
            Postal code
            <input
              name="postalCode"
              defaultValue={location?.postalCode}
              pattern="[0-9]{6}"
              required
            />
          </label>
          <p>
            Coordinates come from your explicitly selected location and are not
            placed in the URL.
          </p>
          <button type="submit">Save address</button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
