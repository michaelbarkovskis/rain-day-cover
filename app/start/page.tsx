import { ActionForm } from "../action-form";
import { saveProfile } from "../actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function Start() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">About you and your work</h1>
        <p className="text-muted">We use your postcode to look up 10 years of rain where you work.</p>
      </div>
      <div className="card">
        <ActionForm action={saveProfile} submit="Continue" pending="Checking your postcode…">
          <div>
            <label className="label" htmlFor="name">First name</label>
            <input className="field" id="name" name="name" autoComplete="given-name" required />
          </div>
          <div>
            <span className="label">Trade</span>
            <p className="field bg-background text-muted">Roofer <span className="text-xs">(more trades coming)</span></p>
          </div>
          <div>
            <label className="label" htmlFor="postcode">Work postcode</label>
            <input className="field uppercase" id="postcode" name="postcode" placeholder="GU1 1AA" autoComplete="postal-code" required />
          </div>
          <div>
            <label className="label" htmlFor="paypal_email">PayPal email (where payouts go)</label>
            <input className="field" id="paypal_email" name="paypal_email" type="email" autoComplete="email" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="work_start">Start</label>
              <select className="field" id="work_start" name="work_start" defaultValue={8}>
                {hours(5, 12).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="work_end">Finish</label>
              <select className="field" id="work_end" name="work_end" defaultValue={16}>
                {hours(12, 20).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label">Days you usually work</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="work_days" value={i + 1} defaultChecked={i < 5} className="peer sr-only" />
                  <span className="block rounded-lg border border-border px-3 py-2 text-sm peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </div>
    </div>
  );
}
