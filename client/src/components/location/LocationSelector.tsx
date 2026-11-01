import { useState, type FormEvent } from 'react';
import { useLocationSelection } from '../../context/LocationContext';
import type { CustomerLocation } from '../../types/location';

const demoAreas = [
  { area: 'Madhapur', postalCode: '500081', latitude: 17.4483, longitude: 78.3915 },
  { area: 'Gachibowli', postalCode: '500032', latitude: 17.4401, longitude: 78.3489 },
  { area: 'Kondapur', postalCode: '500084', latitude: 17.4698, longitude: 78.3631 },
  { area: 'Kukatpally', postalCode: '500072', latitude: 17.4948, longitude: 78.3996 },
  { area: 'Hitech City', postalCode: '500081', latitude: 17.4435, longitude: 78.3772 },
] as const;

type GeoState = 'idle' | 'requesting' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export function LocationSelector() {
  const { location, serviceability, nearbyStores, loading, error, selectLocation } = useLocationSelection();
  const [open, setOpen] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [demoArea, setDemoArea] = useState('');

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setGeoState('unsupported'); return; }
    setGeoState('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState('idle');
        void selectLocation({ label: 'Current location', area: 'Current location', city: 'Hyderabad', postalCode: '',
          latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
          capturedAt: position.timestamp, source: 'browser' });
      },
      (geoError) => setGeoState(geoError.code === 1 ? 'denied' : geoError.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const useDemoArea = () => {
    const area = demoAreas.find((item) => item.area === demoArea);
    if (!area) return;
    void selectLocation({ label: area.area, area: area.area, city: 'Hyderabad', postalCode: area.postalCode,
      latitude: area.latitude, longitude: area.longitude, capturedAt: Date.now(), source: 'demo-area' });
  };

  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: CustomerLocation = {
      label: String(form.get('label')), area: String(form.get('area')), city: String(form.get('city')),
      postalCode: String(form.get('postalCode')), latitude: Number(form.get('latitude')), longitude: Number(form.get('longitude')),
      capturedAt: Date.now(), source: 'manual',
    };
    void selectLocation(next);
  };

  const geoMessage: Record<Exclude<GeoState, 'idle' | 'requesting'>, string> = {
    denied: 'Location permission was denied. Choose a demo area or enter coordinates manually.',
    unavailable: 'Your location is currently unavailable. Try the manual option.',
    timeout: 'Location request timed out. Please try again or choose a demo area.',
    unsupported: 'This browser does not support geolocation. Use a manual location.',
  };

  return <div className="location-selector">
    <button className="location-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span>Deliver to:</span> <strong>{location?.area || 'Select location'}</strong>
    </button>
    {open && <div className="location-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="location-dialog" role="dialog" aria-modal="true" aria-labelledby="location-title">
        <div className="location-dialog-head"><div><p className="kicker">HYDERABAD DEMO</p><h2 id="location-title">Choose delivery location</h2></div><button type="button" aria-label="Close location selector" onClick={() => setOpen(false)}>×</button></div>
        <p>We use your location only after you choose an option, to find nearby simulated demo stores. It is not stored permanently.</p>
        <button className="primary-action" type="button" onClick={useCurrentLocation} disabled={geoState === 'requesting'}>{geoState === 'requesting' ? 'Requesting location…' : 'Use my current location'}</button>
        {geoState !== 'idle' && geoState !== 'requesting' && <p className="location-error" role="alert">{geoMessage[geoState]}</p>}
        <div className="demo-area-row"><label htmlFor="demo-area">Hyderabad demo delivery area</label><div><select id="demo-area" value={demoArea} onChange={(event) => setDemoArea(event.target.value)}><option value="">Select an area</option>{demoAreas.map((area) => <option key={area.area}>{area.area}</option>)}</select><button type="button" onClick={useDemoArea} disabled={!demoArea}>Use demo area</button></div></div>
        <details><summary>Enter location manually</summary><form className="manual-location" onSubmit={submitManual}>
          <label>Address or label<input name="label" required /></label><label>Area<input name="area" required /></label>
          <label>City<input name="city" defaultValue="Hyderabad" required /></label><label>Postal code<input name="postalCode" required pattern="[0-9]{6}" /></label>
          <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" required /></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" required /></label>
          <p>Text addresses are not geocoded. Enter coordinates you already know.</p><button type="submit">Check this location</button>
        </form></details>
        {loading && <p role="status">Checking nearby demo stores…</p>}
        {error && <p className="location-error" role="alert">{error}</p>}
        {!loading && serviceability && <div className={serviceability.isServiceable ? 'service-result success' : 'service-result'} role="status">
          <strong>{serviceability.isServiceable ? 'Demo delivery is available' : "We're not serving this area yet"}</strong>
          {serviceability.nearestStore && <span>Nearest: {serviceability.nearestStore.name} ({serviceability.nearestStore.distanceKm} km)</span>}
          {!serviceability.isServiceable && <><span>Delivery to this location is coming soon. You can continue browsing the catalogue.</span><button type="button" onClick={() => setOpen(false)}>Continue browsing</button></>}
          {serviceability.isServiceable && <small>{nearbyStores.length} demo {nearbyStores.length === 1 ? 'store' : 'stores'} found within 10 km.</small>}
        </div>}
      </section>
    </div>}
  </div>;
}
