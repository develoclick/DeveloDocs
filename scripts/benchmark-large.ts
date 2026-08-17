import autocannon from 'autocannon';

const TARGET_URL = 'http://localhost:3000/v1/docs/generate';

const samplePayload = {
  templateName: 'invoice',
  data: {
    invoiceNumber: 'FAC-SCALE-TEST',
    issueDate: '2026-08-14',
    dueDate: '2026-08-28',
    company: { name: 'DeveloClick S.A.C.', address: 'Av. Arequipa 123', email: 'contacto@develoclick.com' },
    customer: { name: 'Empresa Cliente Corp', email: 'facturacion@cliente.com' },
    items: [
      { description: 'Servicio Cloud SaaS - Plan Enterprise', quantity: 1, unitPrice: 500, subtotal: 500 },
      { description: 'Soporte 24/7 Dedicado', quantity: 1, unitPrice: 200, subtotal: 200 }
    ],
    subtotal: 700,
    total: 700
  }
};

async function runStage(connections: number, durationSeconds: number) {
  console.log(`\n🔥 === ETAPA: ${connections} CONEXIONES CONCURRENTES (${durationSeconds}s) ===`);
  
  const result = await autocannon({
    url: TARGET_URL,
    connections,
    duration: durationSeconds,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(samplePayload),
  });

  console.log(`✅ Completadas: ${result.requests.total} reqs | Exitosas: ${result['2xx']} | Fallidas: ${result.non2xx}`);
  console.log(`⏱️ Latencia Promedio: ${result.latency.average} ms | Máxima: ${result.latency.max} ms`);
  console.log(`📊 Peticiones/segundo (RPS): ${result.requests.average}`);
  
  return result;
}

async function startLargeScaleTest() {
  console.log('🚀 === INICIANDO SUITE DE PRUEBAS A GRAN ESCALA EN DEVELODOCS ===');

  // Etapa 1: Carga Normal (10 conexiones)
  await runStage(10, 15);
  
  // Etapa 2: Carga Media (25 conexiones)
  await runStage(25, 20);

  // Etapa 3: Carga Alta / Estrés (50 conexiones)
  await runStage(50, 20);

  // Etapa 4: Límite Extremo (100 conexiones)
  await runStage(100, 20);

  console.log('\n🏁 Suite de pruebas completada.');
}

startLargeScaleTest();