import world from '@/assets/world.json'
import type { GeoJsonObject } from 'geojson'
import { MapContainer, CircleMarker, Tooltip, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet's default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: '', shadowUrl: '' })

export interface UploadLocation {
  lat: number
  lon: number
  city: string
  country: string
  count: number
}

interface Props {
  locations: UploadLocation[]
}

export function UploadMap({ locations }: Props) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
      worldCopyJump
    >
      <GeoJSON
        data={world as GeoJsonObject}
        style={{
          color: '#40445c',
          weight: 0.7,
          fillColor: '#1e2238',
          fillOpacity: 1,
        }}
      />
      {locations.map((loc, i) => (
        <CircleMarker
          key={i}
          center={[loc.lat, loc.lon]}
          radius={Math.min(5 + loc.count * 1.5, 22)}
          pathOptions={{
            color: '#6366f1',
            fillColor: '#818cf8',
            fillOpacity: 0.75,
            weight: 1.5,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            <span className="text-xs">
              {loc.city ? `${loc.city}, ` : ''}
              {loc.country || 'Unbekannt'}
              {' · '}
              {loc.count} Upload{loc.count !== 1 ? 's' : ''}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
