import { render } from '@testing-library/react';

// The app talks to a server through axios. The test replaces it, so it needs no network and
// never loads axios's ES-module build (which Jest in create-react-app cannot parse).
jest.mock('axios', () => {
  const client = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
  };
  return { __esModule: true, default: client, ...client };
});

import App from './App';

test('the strategy app renders without crashing', () => {
  const { container } = render(<App />);
  expect(container.querySelector('.App')).not.toBeNull();
});
