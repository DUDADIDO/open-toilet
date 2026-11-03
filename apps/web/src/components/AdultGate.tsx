import { useEffect, useRef } from 'react';

interface Props {
  onYes: () => void;
  onBack: () => void;
}

/** adult 모드를 고르면 띄우는 성인 확인 창 */
export function AdultGate({ onYes, onBack }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);

  // 실수로 넘어가지 않도록 '돌아가기'에 먼저 초점을 두고, Esc도 돌아가기로 처리한다
  useEffect(() => {
    backRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="gate-backdrop" onClick={onBack}>
      <div
        className="gate-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gate-badge" aria-hidden="true">
          🔞
        </div>
        <h2 id="gate-title">성인입니까?</h2>
        <p id="gate-desc">adult 모드는 부스 안 1인칭 화면에서 흡연·침 뱉기 같은 장면을 보여 줘요.</p>
        <div className="gate-actions">
          <button ref={backRef} type="button" className="btn" onClick={onBack}>
            돌아가기
          </button>
          <button type="button" className="btn btn--primary" onClick={onYes}>
            예
          </button>
        </div>
      </div>
    </div>
  );
}
