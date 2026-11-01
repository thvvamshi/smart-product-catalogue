export type DemoStoreSeed = {
  storeCode: string;
  name: string;
  description: string;
  addressLine: string;
  landmark: string;
  area: string;
  city: 'Hyderabad';
  state: 'Telangana';
  postalCode: string;
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  preparationTimeMinutes: number;
};

export const demoStores: readonly DemoStoreSeed[] = [
  { storeCode: 'HYD-MAD-001', name: 'Neighbour Cart Madhapur — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 1', landmark: 'Near Demo Junction', area: 'Madhapur', city: 'Hyderabad', state: 'Telangana', postalCode: '500081', latitude: 17.4483, longitude: 78.3915, deliveryRadiusKm: 5.5, preparationTimeMinutes: 15 },
  { storeCode: 'HYD-GAC-001', name: 'Local Loop Gachibowli — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 2', landmark: 'Near Demo Circle', area: 'Gachibowli', city: 'Hyderabad', state: 'Telangana', postalCode: '500032', latitude: 17.4401, longitude: 78.3489, deliveryRadiusKm: 6, preparationTimeMinutes: 18 },
  { storeCode: 'HYD-KON-001', name: 'Quick Basket Kondapur — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 3', landmark: 'Near Demo Park', area: 'Kondapur', city: 'Hyderabad', state: 'Telangana', postalCode: '500084', latitude: 17.4698, longitude: 78.3631, deliveryRadiusKm: 5, preparationTimeMinutes: 16 },
  { storeCode: 'HYD-KUK-001', name: 'Corner Crate Kukatpally — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 4', landmark: 'Near Demo Metro', area: 'Kukatpally', city: 'Hyderabad', state: 'Telangana', postalCode: '500072', latitude: 17.4948, longitude: 78.3996, deliveryRadiusKm: 6.5, preparationTimeMinutes: 20 },
  { storeCode: 'HYD-HIT-001', name: 'Urban Shelf Hitech City — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 5', landmark: 'Near Demo Towers', area: 'Hitech City', city: 'Hyderabad', state: 'Telangana', postalCode: '500081', latitude: 17.4435, longitude: 78.3772, deliveryRadiusKm: 4.5, preparationTimeMinutes: 14 },
  { storeCode: 'HYD-JUB-001', name: 'Daily Drop Jubilee Hills — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 6', landmark: 'Near Demo Checkpost', area: 'Jubilee Hills', city: 'Hyderabad', state: 'Telangana', postalCode: '500033', latitude: 17.4319, longitude: 78.4071, deliveryRadiusKm: 5, preparationTimeMinutes: 17 },
  { storeCode: 'HYD-BAN-001', name: 'City Pantry Banjara Hills — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 7', landmark: 'Near Demo Mall', area: 'Banjara Hills', city: 'Hyderabad', state: 'Telangana', postalCode: '500034', latitude: 17.4156, longitude: 78.4347, deliveryRadiusKm: 4.5, preparationTimeMinutes: 19 },
  { storeCode: 'HYD-MIY-001', name: 'Pocket Market Miyapur — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 8', landmark: 'Near Demo Lake', area: 'Miyapur', city: 'Hyderabad', state: 'Telangana', postalCode: '500049', latitude: 17.4968, longitude: 78.3614, deliveryRadiusKm: 6, preparationTimeMinutes: 21 },
  { storeCode: 'HYD-BEG-001', name: 'Neighbourly Begumpet — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 9', landmark: 'Near Demo Airport Road', area: 'Begumpet', city: 'Hyderabad', state: 'Telangana', postalCode: '500016', latitude: 17.4447, longitude: 78.4664, deliveryRadiusKm: 5.5, preparationTimeMinutes: 18 },
  { storeCode: 'HYD-SEC-001', name: 'Metro Basket Secunderabad — DEMO', description: 'Simulated hyperlocal store for product demonstrations.', addressLine: 'Sample Road 10', landmark: 'Near Demo Station', area: 'Secunderabad', city: 'Hyderabad', state: 'Telangana', postalCode: '500003', latitude: 17.4399, longitude: 78.4983, deliveryRadiusKm: 6, preparationTimeMinutes: 22 },
] as const;
