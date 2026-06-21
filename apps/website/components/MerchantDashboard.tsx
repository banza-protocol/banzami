// Merchant dashboard mock used on the Home merchant split and the Comerciantes hero.
const TX = [
  { initial: 'J', handle: '@joao', meta: 'há 2 min · QR', amount: '+2.500' },
  { initial: 'A', handle: '@ana-r', meta: 'há 14 min · link', amount: '+8.000' },
  { initial: 'M', handle: '@mercado-k', meta: 'há 1 h · QR', amount: '+1.250' },
];

export function MerchantDashboard() {
  return (
    <div className="rounded-[28px] bg-white p-[26px] shadow-panel">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="m-0 text-[13px] font-bold text-ink-faint">Saldo da carteira</p>
          <p className="m-0 mt-1 text-[30px] font-black tracking-[-0.02em]">
            142.800 <span className="text-[16px] text-ink-faint">Kz</span>
          </p>
        </div>
        <span className="bz-mono rounded-pill bg-pink-200 px-3 py-[7px] text-[12px] font-semibold text-banzami">
          @padaria-luanda
        </span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {TX.map((t) => (
          <div
            key={t.handle}
            className="flex items-center justify-between rounded-[18px] bg-pink-50 px-4 py-[13px]"
          >
            <div className="flex items-center gap-[11px]">
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] bg-pink-200 text-[14px] font-black text-banzami">
                {t.initial}
              </span>
              <div>
                <p className="m-0 text-[14px] font-extrabold">{t.handle}</p>
                <p className="m-0 mt-[1px] text-[11.5px] font-bold text-ink-faint">{t.meta}</p>
              </div>
            </div>
            <span className="text-[15px] font-black text-banzami">{t.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
