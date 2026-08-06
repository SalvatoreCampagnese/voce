# Come si crea un amministratore di VOCE

Il pannello (`/admin`) è il punto in cui una persona si assume la responsabilità
di un testo scritto da una macchina. Senza almeno un amministratore, **nessun
atto viene mai revisionato e quindi nessun atto parte**: tutto il resto del
sistema gira a vuoto.

Un amministratore non si registra da solo. Va provvisto, e serve la service role
key. È una scelta deliberata: con l'auto-registrazione, chiunque conoscesse
l'indirizzo di un amministratore poteva farsi creare un conto su quella email.

## Le tre cose che servono, tutte e tre

| Cosa | Dove | Se manca |
|---|---|---|
| Conto di autenticazione, **già confermato** | `auth.users` | Il codice non arriva: parte il messaggio «conferma il tuo indirizzo», che non contiene le sei cifre |
| Riga in `public.admins` | tabella `admins` | Si entra, ma `is_admin()` resta falso e ogni pagina mostra zero righe |
| Finestra d'invito aperta | `admins.link_allowed_until` | `link_current_admin()` restituisce `false` e i privilegi non si attivano mai |

## Procedura

Sostituisci indirizzo e nome. Servono la URL del progetto e la
`SUPABASE_SERVICE_ROLE_KEY` (in locale le trovi con `supabase status`).

### 1. Il conto di autenticazione

```sh
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"nome.cognome@comune.it","email_confirm":true}'
```

`email_confirm: true` è obbligatorio. Serve a dire che l'indirizzo è già
verificato **da chi amministra**, e non da chi si presenta.

### 2. La riga in `admins` e la finestra d'invito

```sql
insert into public.admins (email, full_name, link_allowed_until)
values ('nome.cognome@comune.it', 'Nome Cognome', now() + interval '48 hours')
on conflict (email) do update
  set full_name         = excluded.full_name,
      link_allowed_until = now() + interval '48 hours';
```

`full_name` finisce in `actions.reviewed_by` e diventa **pubblico** sugli atti
revisionati: è il nome che i cittadini leggeranno accanto al documento che hanno
firmato. Va scritto per esteso e per davvero.

La finestra si consuma al primo ingresso. Se scade prima, si riapre rieseguendo
solo la `update`.

### 3. L'accesso

La persona apre `/admin/accesso`, scrive il suo indirizzo e riceve un codice di
sei cifre. In locale le email non partono: si leggono su
<http://127.0.0.1:54324> (Mailpit).

## Sul progetto cloud, una volta sola

Due impostazioni non vivono nel repo e vanno replicate a mano:

1. **Authentication → Providers → Email → Confirm email: attivo.**
   Con le conferme disattivate, chiunque può registrarsi dichiarando l'indirizzo
   di un amministratore. In locale lo impone `supabase/config.toml`.
2. **Authentication → Emails → Magic Link**: incolla il contenuto di
   `supabase/templates/magic_link.html`. Il modello predefinito manda solo un
   collegamento, mentre il pannello chiede le sei cifre di `{{ .Token }}`.

## Togliere un amministratore

```sql
delete from public.admins where email = 'nome.cognome@comune.it';
```

La riga in `auth.users` può restare: senza `admins`, `is_admin()` è falso e il
pannello non mostra niente. Gli atti che quella persona ha revisionato
conservano il suo nome, ed è giusto così: una revisione è un atto di
responsabilità, e resta agli atti anche quando chi l'ha fatta non lavora più qui.
