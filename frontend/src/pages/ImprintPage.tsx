import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Spinner } from '@/components/ui/Spinner'

async function fetchLegal() {
  const res = await api.get('/settings/legal')
  return res.data as { privacyPolicy: string; imprint: string }
}

export function ImprintPage() {
  const { data, isLoading } = useQuery({ queryKey: ['legal'], queryFn: fetchLegal })

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Impressum</h1>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {!isLoading && !data?.imprint && (
        <p className="text-text-muted text-sm">
          Es wurde noch kein Impressum hinterlegt. Der Administrator kann dieses unter
          Admin → Einstellungen → Datenschutz pflegen.
        </p>
      )}

      {data?.imprint && (
        <div className="prose prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary leading-relaxed">
            {data.imprint}
          </pre>
        </div>
      )}
    </div>
  )
}
