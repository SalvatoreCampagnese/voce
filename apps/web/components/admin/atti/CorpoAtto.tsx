import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CalloutAvviso } from '@voce/ui'

/**
 * Il testo dell'atto, come lo vedrà chi lo riceve.
 *
 * Il disclaimer sta SOPRA il corpo e non in fondo: chi legge deve sapere che
 * sta leggendo un testo scritto da una macchina prima di iniziare, non dopo
 * essersi convinto che sia corretto.
 *
 * `prose-voce` è la stessa classe della pagina pubblica: quello che si vede
 * qui è quello che finirà online, senza sorprese di impaginazione.
 */
export function CorpoAtto({
  bodyMarkdown,
  reviewedBy,
}: {
  bodyMarkdown: string | null
  reviewedBy: string | null
}) {
  return (
    <>
      <CalloutAvviso tono="attenzione" titolo="Bozza assistita dall’AI">
        Questo testo è stato scritto da un modello a partire dalle segnalazioni
        dei cittadini. Contiene fatti da verificare uno per uno.
        {reviewedBy
          ? ` Lo ha revisionato ${reviewedBy}, ed è pubblico.`
          : ' Nessuno lo ha ancora letto: non è pubblico.'}
      </CalloutAvviso>

      {bodyMarkdown ? (
        <article className="prose-voce mt-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMarkdown}</ReactMarkdown>
        </article>
      ) : (
        <p className="mt-6 text-body text-ink-muted">
          Questo atto non ha ancora un testo.
        </p>
      )}
    </>
  )
}
