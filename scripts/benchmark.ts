import autocannon from 'autocannon';

async function runBenchmark() {
  console.log('🚀 Iniciando prueba de carga en DeveloDocs...');

  const result = await autocannon({
    url: 'http://localhost:3000/v1/docs/generate',
    connections: 10, // 10 peticiones concurrentes
    duration: 10,    // Duración de 10 segundos
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      templateName: 'invoice',
      data: {
        invoiceNumber: 'FAC-BENCHMARK',
        issueDate: '2026-08-14',
        dueDate: '2026-08-28',
        company: {
          name: 'DEVELOCLICK S.A.C.',
          address: 'Av. Principal 456',
          email: 'contacto@develoclick.com',
        },
        customer: {
          name: 'TechSolutions Global',
          email: 'pagos@tech.com',
        },
        items: [
          {
            description: 'Item de prueba de carga',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
          },
        ],
        subtotal: 100,
        total: 100,
      },
    }),
  });

  console.log(autocannon.printResult(result));
}

runBenchmark();