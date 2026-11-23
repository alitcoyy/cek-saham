'use client';

import { useEffect, useRef } from 'react';
import { FORM_GROUPS, type FormState } from '@/lib/fields';

export function InputsForm({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
  const bank = form.sector === 'bank';
  const set = (key: keyof FormState, value: string) => onChange({ ...form, [key]: value });
  const ref = useRef<HTMLDetailsElement>(null);

  // Di layar lebar panel langsung terbuka; di HP dilipat supaya hasil tampil lebih dulu.
  useEffect(() => {
    if (ref.current && matchMedia('(min-width: 900px)').matches) ref.current.open = true;
  }, []);

  return (
    <details className="card side" ref={ref}>
      <summary>
        <span>Data laporan<small>Lihat atau koreksi angka, hasil dihitung ulang langsung</small></span>
      </summary>
      <form onSubmit={(e) => e.preventDefault()} autoComplete="off">
        {FORM_GROUPS.map(([title, fields]) => {
          const shown = fields.filter((f) => !f.only || (f.only === 'bank') === bank);
          if (!shown.length) return null;
          return (
            <fieldset key={title}>
              <legend>{title}</legend>
              <div className="fields">
                {shown.map((f) => (
                  <div key={f.key} className={f.options ? 'f wide' : 'f'}>
                    <label htmlFor={f.key}>
                      {f.label}
                      {f.unit && <span className="u"> · {f.unit}</span>}
                    </label>
                    <div className="box">
                      {f.options ? (
                        <select id={f.key} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                          {f.options.map(([v, t]) => (
                            <option key={v} value={v}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={f.key}
                          type={f.text ? 'text' : 'number'}
                          inputMode={f.text ? undefined : 'decimal'}
                          step="any"
                          value={form[f.key]}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          );
        })}
      </form>
    </details>
  );
}
