import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or current dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

export async function setupStripeCatalog() {
  console.log('================================================================');
  console.log('💳 [SlotMatrix] Configuração de Catálogo Stripe (Modo Teste)');
  console.log('================================================================');

  if (!secretKey || !secretKey.startsWith('sk_test_') || secretKey.includes('demo') || secretKey.includes('your_stripe')) {
    console.error('❌ Erro: STRIPE_SECRET_KEY inválida ou ausente no .env.');
    console.error('   Certifique-se de configurar uma chave de teste real (sk_test_...) no seu arquivo .env.');
    console.error('   Obtenha sua chave em: https://dashboard.stripe.com/test/apikeys');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: '2024-06-20' as any,
    timeout: 15000,
    maxNetworkRetries: 2,
    appInfo: {
      name: 'SlotMatrix Setup Script',
      version: '1.0.0',
    },
  });

  const catalog = [
    {
      plan: 'PRO',
      productName: 'SlotMatrix Pro',
      productDescription: 'Assinatura recorrente mensal do Plano Pro (até 40 recursos, agendamentos ilimitados, lista de espera)',
      amountCents: 34900, // R$ 349,00
      currency: 'brl',
      lookupKey: 'slotmatrix_pro_monthly',
    },
    {
      plan: 'ENTERPRISE',
      productName: 'SlotMatrix Enterprise',
      productDescription: 'Assinatura recorrente mensal do Plano Enterprise (recursos ilimitados, alta disponibilidade, suporte dedicado)',
      amountCents: 89000, // R$ 890,00
      currency: 'brl',
      lookupKey: 'slotmatrix_enterprise_monthly',
    },
  ];

  const results: Record<string, { productId: string; priceId: string; lookupKey: string; amount: string }> = {};

  for (const item of catalog) {
    console.log(`\n🔍 Verificando preço para o Plano ${item.plan} (lookup_key: ${item.lookupKey})...`);

    // 1. Verifica se o preço já existe pelo lookup_key
    const existingPrices = await stripe.prices.list({
      lookup_keys: [item.lookupKey],
      expand: ['data.product'],
    });

    if (existingPrices.data.length > 0) {
      const price = existingPrices.data[0];
      const prodId = typeof price.product === 'string' ? price.product : price.product.id;
      console.log(`   ✓ Preço existente encontrado: ${price.id} (Produto: ${prodId})`);
      results[item.plan] = {
        productId: prodId,
        priceId: price.id,
        lookupKey: item.lookupKey,
        amount: `R$ ${(item.amountCents / 100).toFixed(2)}/mês`,
      };
      continue;
    }

    // 2. Se não existir, busca ou cria o Produto
    console.log(`   Criando produto '${item.productName}' no Stripe...`);
    const product = await stripe.products.create({
      name: item.productName,
      description: item.productDescription,
      metadata: {
        plan: item.plan,
        app: 'SlotMatrix',
      },
    });

    // 3. Cria o Preço recorrente mensal com lookup_key
    console.log(`   Criando preço recorrente de R$ ${(item.amountCents / 100).toFixed(2)}/mês...`);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: item.amountCents,
      currency: item.currency,
      recurring: {
        interval: 'month',
      },
      lookup_key: item.lookupKey,
      metadata: {
        plan: item.plan,
        app: 'SlotMatrix',
      },
    });

    console.log(`   ✓ Preço criado com sucesso: ${price.id}`);
    results[item.plan] = {
      productId: product.id,
      priceId: price.id,
      lookupKey: item.lookupKey,
      amount: `R$ ${(item.amountCents / 100).toFixed(2)}/mês`,
    };
  }

  console.log('\n================================================================');
  console.log('✅ Catálogo Stripe configurado com sucesso e idempotência!');
  console.log('================================================================');
  console.table(results);
}

if (require.main === module) {
  setupStripeCatalog().catch((err) => {
    console.error('❌ Falha ao configurar catálogo no Stripe:', err.message || err);
    process.exit(1);
  });
}
