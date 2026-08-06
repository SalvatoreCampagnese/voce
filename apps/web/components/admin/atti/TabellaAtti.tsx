import Link from 'next/link'
import { TagStato } from '@voce/ui'
import { ACTION_KIND_LABELS, type ActionKind, type AdminActionQueueItem } from '@voce/db'

import { CellaAdmin, TabellaAdmin } from '@/components/admin/shell/TabellaAdmin'
import { Scadenza } from './Scadenza'

/**
 * La coda degli atti.
 *
 * Tabella vera e non griglia di riquadri: chi lavora qui confronta righe fra
 * loro — «quali scadono questa settimana», «quali sono fermi in bozza» — e una
 * tabella è l'unica forma che lo permette a colpo d'occhio e da tastiera.
 *
 * Il contenitore, la didascalia e gli `scope` li mette `TabellaAdmin`: sono le
 * tre cose che una tabella scritta di fretta non ha, e averle in un solo posto
 * significa non doverle rifare bene ogni volta.
 */
export function TabellaAtti({ atti }: { atti: AdminActionQueueItem[] }) {
  return (
    <TabellaAdmin
      didascalia="Atti in lavorazione: tipo, gruppo di origine, stato, destinatario, firme, termine di legge e revisione."
      colonne={[
        'Atto',
        'Gruppo',
        'Stato',
        'Destinatario',
        'Firme',
        'Termine',
        'Revisione',
      ]}
    >
      {atti.map((atto) => (
        <tr key={atto.id ?? ''}>
          <CellaAdmin intestazione>
            <Link
              href={`/admin/atti/${atto.id}`}
              className="text-primary-600 underline underline-offset-2"
            >
              {atto.title ?? 'Atto senza titolo'}
            </Link>
            <span className="block text-caption font-normal text-ink-muted">
              {atto.kind
                ? (ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind)
                : 'tipo non indicato'}
            </span>
            {atto.is_synthetic && (
              // Un atto di prova non deve mai essere revisionato come vero: la
              // scritta sta accanto al titolo, non in fondo alla riga.
              <span className="mt-1 inline-block rounded-pill bg-warning-bg px-2 py-0.5 text-caption font-semibold text-warning">
                Dati di prova
              </span>
            )}
          </CellaAdmin>

          <CellaAdmin>
            {atto.cluster_title ?? '—'}
            <span className="block text-caption text-ink-muted">
              {atto.city ?? 'comune non indicato'}
            </span>
            {atto.cluster_review_flag && (
              <span className="block text-caption font-semibold text-warning">
                Gruppo in revisione
              </span>
            )}
          </CellaAdmin>

          <CellaAdmin>
            {atto.status ? <TagStato stato={atto.status} /> : '—'}
            {(atto.risposte_da_confermare ?? 0) > 0 && (
              <span className="mt-1 block text-caption font-semibold text-ink">
                {atto.risposte_da_confermare} risposte da confermare
              </span>
            )}
          </CellaAdmin>

          <CellaAdmin>{atto.recipient ?? 'da definire'}</CellaAdmin>

          <CellaAdmin className="tabular-nums">
            {atto.signatures_count ?? 0} / {atto.signatures_target ?? 0}
          </CellaAdmin>

          <CellaAdmin>
            <Scadenza deadlineAt={atto.deadline_at} deadlineBasis={atto.deadline_basis} />
          </CellaAdmin>

          <CellaAdmin>
            {atto.reviewed_by ? (
              <>
                <span className="font-semibold text-ink">{atto.reviewed_by}</span>
                <span className="block text-caption text-ink-muted">testo pubblico</span>
              </>
            ) : (
              <span className="font-semibold text-warning">Da revisionare</span>
            )}
          </CellaAdmin>
        </tr>
      ))}
    </TabellaAdmin>
  )
}
