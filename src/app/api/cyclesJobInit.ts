/**
 * cyclesJobInit se mantiene solo por compatibilidad.
 *
 * Ya no inicializa ningún job en memoria. Para procesamiento periódico
 * de ciclos, configura un CRON externo que invoque `/api/cyclesJob`.
 */

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      message:
        'cyclesJobInit está deprecado. Usa un cron externo hacia /api/cyclesJob.',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
