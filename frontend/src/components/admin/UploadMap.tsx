import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
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
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
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
              {loc.city ? `${loc.city}, ` : ''}{loc.country || 'Unbekannt'}
              {' · '}{loc.count} Upload{loc.count !== 1 ? 's' : ''}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
