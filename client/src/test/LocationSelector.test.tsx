import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { Navbar } from '../components/Navbar';
import { LocationProvider } from '../context/LocationContext';

const serviceable = { data: { isServiceable: true, customerLocation: { latitude: 17.4401, longitude: 78.3489 }, nearestStore: { id: '2', name: 'Local Loop Gachibowli — DEMO', area: 'Gachibowli', distanceKm: 0, deliveryRadiusKm: 6, isDemo: true } } };
const unavailable = { data: { isServiceable: false, customerLocation: { latitude: 28.6139, longitude: 77.209 }, nearestStore: null } };
const nearby = { data: [{ ...serviceable.data.nearestStore, storeCode: 'HYD-GAC-001', city: 'Hyderabad', latitude: 17.4401, longitude: 78.3489, preparationTimeMinutes: 18, isServiceable: true }], meta: { count: 1, searchRadiusKm: 10 } };
const productResponse = { data: [{ id: '1', sku: 'SKU-1', name: 'Existing Product', description: 'Catalogue remains available', brand: 'Aster', category: 'Home', price: 10, rating: 4, inStock: true, createdAt: '2024-01-01T00:00:00.000Z', imageUrl: null }], pagination: { limit: 20, nextCursor: null, hasNextPage: false } };
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

function installFetch(serviceabilityBody: unknown = serviceable) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/stores/serviceability')) return Promise.resolve(ok(serviceabilityBody));
    if (url.includes('/stores/nearby')) return Promise.resolve(ok(nearby));
    return Promise.resolve(ok(productResponse));
  }));
}

function renderNavbar() {
  return render(<MemoryRouter><LocationProvider><Navbar /><Routes><Route path="/" element={<p>Catalogue route</p>} /><Route path="/docs" element={<p>Docs route</p>} /></Routes></LocationProvider></MemoryRouter>);
}

function installGeolocation(implementation: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: implementation } });
}

async function openSelector() {
  await userEvent.click(screen.getByRole('button', { name: /Deliver to:/i }));
}

describe('LocationSelector', () => {
  beforeEach(() => installFetch());
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  });

  it('starts with no selected location and opens an accessible selector', async () => {
    renderNavbar();
    expect(screen.getByRole('button', { name: /Deliver to: Select location/i })).toBeInTheDocument();
    await openSelector();
    expect(screen.getByRole('dialog', { name: 'Choose delivery location' })).toBeInTheDocument();
    expect(screen.getByText(/only after you choose an option/i)).toBeInTheDocument();
  });

  it('uses browser geolocation only after the explicit action', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => success({ coords: { latitude: 17.4401, longitude: 78.3489, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: 1234, toJSON: () => ({}) }));
    installGeolocation(getCurrentPosition);
    renderNavbar();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await openSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    expect(await screen.findByText('Demo delivery is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deliver to: Current location/i })).toBeInTheDocument();
  });

  it.each([[1, 'permission was denied'], [2, 'currently unavailable'], [3, 'timed out']])('handles geolocation error code %s', async (code, message) => {
    installGeolocation((_success, failure) => failure?.({ code, message: 'test', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
    renderNavbar();
    await openSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles browsers without geolocation support', async () => {
    renderNavbar();
    await openSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not support geolocation');
  });

  it('selects a predefined Hyderabad demo area and displays serviceability', async () => {
    renderNavbar();
    await openSelector();
    await userEvent.selectOptions(screen.getByLabelText('Hyderabad demo delivery area'), 'Gachibowli');
    await userEvent.click(screen.getByRole('button', { name: 'Use demo area' }));
    expect(await screen.findByText('Demo delivery is available')).toBeInTheDocument();
    expect(screen.getByText(/Nearest: Local Loop Gachibowli/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deliver to: Gachibowli/i })).toBeInTheDocument();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('latitude=17.4401');
  });

  it('accepts a manual label, area, postal code, and explicit coordinates', async () => {
    renderNavbar();
    await openSelector();
    await userEvent.click(screen.getByText('Enter location manually'));
    await userEvent.type(screen.getByLabelText('Address or label'), 'My office');
    await userEvent.type(screen.getByLabelText('Area'), 'Gachibowli');
    await userEvent.type(screen.getByLabelText('Postal code'), '500032');
    await userEvent.type(screen.getByLabelText('Latitude'), '17.4401');
    await userEvent.type(screen.getByLabelText('Longitude'), '78.3489');
    await userEvent.click(screen.getByRole('button', { name: 'Check this location' }));
    expect(await screen.findByText('Demo delivery is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deliver to: Gachibowli/i })).toBeInTheDocument();
  });

  it('shows a valid unavailable delivery result', async () => {
    installFetch(unavailable);
    renderNavbar();
    await openSelector();
    await userEvent.selectOptions(screen.getByLabelText('Hyderabad demo delivery area'), 'Madhapur');
    await userEvent.click(screen.getByRole('button', { name: 'Use demo area' }));
    expect(await screen.findByText("We're not serving this area yet")).toBeInTheDocument();
    expect(screen.getByText(/Delivery to this location is coming soon/)).toBeInTheDocument();
  });

  it('reports API failures without losing the selected location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    renderNavbar();
    await openSelector();
    await userEvent.selectOptions(screen.getByLabelText('Hyderabad demo delivery area'), 'Kondapur');
    await userEvent.click(screen.getByRole('button', { name: 'Use demo area' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByRole('button', { name: /Deliver to: Kondapur/i })).toBeInTheDocument();
  });

  it('keeps the selected location across navigation during the session', async () => {
    renderNavbar();
    await openSelector();
    await userEvent.selectOptions(screen.getByLabelText('Hyderabad demo delivery area'), 'Madhapur');
    await userEvent.click(screen.getByRole('button', { name: 'Use demo area' }));
    await screen.findByText('Demo delivery is available');
    await userEvent.click(screen.getByRole('link', { name: 'API Docs' }));
    expect(screen.getByText('Docs route')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deliver to: Madhapur/i })).toBeInTheDocument();
  });

  it('does not block the existing catalogue when no location is selected', async () => {
    render(<App />);
    expect(await screen.findByText('Existing Product')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deliver to: Select location/i })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
