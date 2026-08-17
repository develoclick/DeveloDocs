import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 5 },   // Carga progresiva a 5 usuarios
    { duration: '20s', target: 20 },  // Pico de 20 usuarios en paralelo
    { duration: '10s', target: 0 },   // Enfriamiento
  ],
};

export default function () {
  const url = 'http://localhost:3000/v1/docs/generate';
  const payload = JSON.stringify({
    templateName: 'invoice',
    data: {
      invoiceNumber: 'FAC-TEST',
      issueDate: '2026-08-14',
      dueDate: '2026-08-28',
      company: { name: 'Test SAC', address: 'Calle 123', email: 'test@test.com' },
      customer: { name: 'Client Test', email: 'client@test.com' },
      items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, subtotal: 100 }],
      subtotal: 100,
      total: 100
    }
  });

  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(url, payload, params);

  check(res, {
    'status es 200': (r) => r.status === 200,
    'tipo es PDF': (r) => r.headers['Content-Type'] === 'application/pdf',
  });

  sleep(1);
}