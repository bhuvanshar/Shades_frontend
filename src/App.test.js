import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import StoreContextProvider from './context/StoreContext';
import App from './App';

test('renders the storefront navigation', () => {
  render(<BrowserRouter><AuthProvider><StoreContextProvider><App /></StoreContextProvider></AuthProvider></BrowserRouter>);
  expect(screen.getByText(/sign in/i)).toBeInTheDocument();
});
