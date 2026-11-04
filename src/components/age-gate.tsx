import { Button } from "@/components/button";

export function AgeGate({
  declined,
  onYes,
  onNo,
  onBack,
}: {
  declined: boolean;
  onYes: () => void;
  onNo: () => void;
  onBack: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center bg-white px-6 py-16">
      <img
        src="/brand/logo.png?v=4"
        alt="Mr.Puff"
        className="h-auto w-auto max-w-[200px] object-contain"
      />
      <p className="mt-6 text-xs font-medium tracking-widest text-mist uppercase">18+</p>
      <h1 className="mt-3 font-display text-5xl text-ink">Mr.Puff</h1>
      <p className="mt-6 max-w-md text-lg text-mist">Электронные системы. Каталог и быстрый заказ.</p>
      {declined ? (
        <div className="mt-12">
          <p className="text-2xl text-ink">Доступ закрыт.</p>
          <p className="mt-3 text-mist">Продажа несовершеннолетним запрещена.</p>
          <Button variant="ghost" className="mt-8" onClick={onBack}>
            Назад
          </Button>
        </div>
      ) : (
        <div className="mt-12">
          <p className="text-2xl text-ink">Вам уже исполнилось 18 лет?</p>
          <p className="mt-3 text-sm text-mist">Продажа несовершеннолетним запрещена.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={onYes}>Да, мне есть 18</Button>
            <Button variant="ghost" onClick={onNo}>
              Нет
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
