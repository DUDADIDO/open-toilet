import { useState, type FormEvent } from 'react';
import { client, type ViewMode } from '../connection/client';
import { AdultGate } from './AdultGate';

interface Props {
  error: string | null;
  notice: string | null;
  busy: boolean;
  viewMode: ViewMode;
  /** 로비로 나왔을 때 미리 채워 둘 이름 */
  lastName: string | null;
}

const VIEW_MODES: { mode: ViewMode; icon: string; title: string; desc: string }[] = [
  { mode: 'normal', icon: '🚻', title: 'normal', desc: '밖에서 부스와 줄을 내려다보는 3인칭' },
  { mode: 'adult', icon: '🔞', title: 'adult', desc: '들어가면 변기에 앉은 1인칭 + 문 CCTV' },
];

export function NameScreen({ error, notice, busy, viewMode, lastName }: Props) {
  const [name, setName] = useState(lastName ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [askAdult, setAskAdult] = useState(false);

  // adult는 성인 확인을 거쳐야 고를 수 있다
  const pick = (mode: ViewMode) => {
    if (mode === 'adult') setAskAdult(true);
    else client.setViewMode(mode);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.normalize('NFC').trim();
    const length = [...trimmed].length;
    if (length < 1 || length > 12) {
      setLocalError('이름은 공백 제외 1~12자로 입력해 주세요.');
      return;
    }
    setLocalError(null);
    client.joinWithName(trimmed); // 클릭(제출) 핸들러 안에서 오디오 unlock
  };

  const shown = localError ?? error;

  return (
    <main className="name-screen">
      <form className="name-card" onSubmit={submit}>
        <div className="logo" aria-hidden="true">
          🚽
        </div>
        <h1>Open Toilet</h1>
        <p className="lead">모두가 함께 쓰는 1인용 화장실. 먼저 이름부터 알려주세요.</p>
        {notice && <p className="notice-inline">{notice}</p>}
        <label htmlFor="name">내 이름</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoComplete="off"
          autoFocus
          placeholder="최대 12자"
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? 'name-error' : undefined}
        />
        {shown && (
          <p id="name-error" className="field-error" role="alert">
            {shown}
          </p>
        )}
        {/* 같은 화장실을 쓰고 보는 방식만 다르다 */}
        <fieldset className="mode-picker">
          <legend>보는 방식</legend>
          {VIEW_MODES.map((m) => (
            <label key={m.mode} className={m.mode === viewMode ? 'mode-option is-selected' : 'mode-option'}>
              <input
                type="radio"
                name="view-mode"
                value={m.mode}
                checked={m.mode === viewMode}
                onChange={() => pick(m.mode)}
              />
              <span className="mode-icon" aria-hidden="true">
                {m.icon}
              </span>
              <span className="mode-text">
                <strong>{m.title}</strong>
                <small>{m.desc}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? '접속 중…' : '입장'}
        </button>
        <p className="hint">입장하면 효과음이 켜집니다 🔊 · 모드는 들어가서도 바꿀 수 있어요</p>
      </form>
      {askAdult && (
        <AdultGate
          onYes={() => {
            setAskAdult(false);
            client.setViewMode('adult');
          }}
          onBack={() => setAskAdult(false)}
        />
      )}
    </main>
  );
}
