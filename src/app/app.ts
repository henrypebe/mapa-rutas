import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GoogleMap, MapDirectionsRenderer, MapMarker } from '@angular/google-maps';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, GoogleMap, MapMarker, MapDirectionsRenderer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements AfterViewInit {
  @ViewChild('originInput') originInput!: ElementRef<HTMLInputElement>;
  @ViewChild('destInput') destInput!: ElementRef<HTMLInputElement>;

  zoom = 13;
  center: google.maps.LatLngLiteral = { lat: -12.0464, lng: -77.0428 }; // Lima

  origin: google.maps.LatLngLiteral | null = null;
  destination: google.maps.LatLngLiteral | null = null;

  travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' = 'DRIVING';

  directionsResult: google.maps.DirectionsResult | null = null;
  distanceText = '';
  durationText = '';

  private isBrowser: boolean;
  private directionsService: google.maps.DirectionsService | null = null;
  private geocoder: google.maps.Geocoder | null = null;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    this.waitForGoogleMaps(() => {
      this.directionsService = new google.maps.DirectionsService();
      this.geocoder = new google.maps.Geocoder();

      // Autocomplete Origen
      const originAC = new google.maps.places.Autocomplete(this.originInput.nativeElement, {
        fields: ['geometry', 'name', 'formatted_address'],
      });

      originAC.addListener('place_changed', () => {
        const place = originAC.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;

        this.origin = { lat: loc.lat(), lng: loc.lng() };
        this.center = this.origin;
        this.tryRoute();
      });

      // Autocomplete Destino
      const destAC = new google.maps.places.Autocomplete(this.destInput.nativeElement, {
        fields: ['geometry', 'name', 'formatted_address'],
      });

      destAC.addListener('place_changed', () => {
        const place = destAC.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;

        this.destination = { lat: loc.lat(), lng: loc.lng() };
        this.center = this.destination;
        this.tryRoute();
      });
    });
  }

  setMode(mode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT') {
    this.travelMode = mode;
    this.tryRoute();
  }

  clear() {
    this.origin = null;
    this.destination = null;
    this.directionsResult = null;
    this.distanceText = '';
    this.durationText = '';

    if (this.isBrowser) {
      this.originInput.nativeElement.value = '';
      this.destInput.nativeElement.value = '';
    }
  }

  async onMapClick(ev: google.maps.MapMouseEvent) {
    if (!this.isBrowser) return;
    if (!ev.latLng) return;

    const p = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };

    // decidir destino del click
    let target: 'origin' | 'destination';
    if (!this.origin) target = 'origin';
    else if (!this.destination) target = 'destination';
    else {
      // si ya había ambos, reiniciamos
      this.origin = null;
      this.destination = null;
      this.directionsResult = null;
      this.distanceText = '';
      this.durationText = '';
      target = 'origin';
    }

    // Setear coords inmediato (feedback instantáneo)
    if (target === 'origin') {
      this.origin = p;
      this.center = p;
      this.originInput.nativeElement.value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    } else {
      this.destination = p;
      this.center = p;
      this.destInput.nativeElement.value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    }

    // Reverse geocoding (coords -> dirección)
    const address = await this.reverseGeocode(p);
    if (address) {
      if (target === 'origin') this.originInput.nativeElement.value = address;
      else this.destInput.nativeElement.value = address;
    }

    this.tryRoute();
  }

  private tryRoute() {
    if (!this.isBrowser) return;
    if (!this.directionsService) return;
    if (!this.origin || !this.destination) return;

    this.directionsService.route(
      {
        origin: this.origin,
        destination: this.destination,
        travelMode: google.maps.TravelMode[this.travelMode],

        drivingOptions: {
          departureTime: new Date(), // AHORA MISMO
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        if (status === 'OK' && result) {
          this.directionsResult = result;

          const leg = result.routes[0]?.legs[0];

          this.distanceText = leg?.distance?.text ?? '';
          
          this.durationText =
            leg?.duration_in_traffic?.text ??
            leg?.duration?.text ??
            '';
        }
      }
    );
  }

  private reverseGeocode(p: google.maps.LatLngLiteral): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.geocoder) return resolve(null);

      this.geocoder.geocode({ location: p }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          resolve(results[0].formatted_address ?? null);
        } else {
          resolve(null);
        }
      });
    });
  }

  private waitForGoogleMaps(done: () => void) {
    const maxMs = 15000;
    const start = Date.now();

    const tick = () => {
      // @ts-ignore
      if (window.google?.maps?.places) return done();

      if (Date.now() - start > maxMs) {
        console.error('Google Maps no cargó. Revisa tu API key y el script en index.html.');
        return;
      }
      setTimeout(tick, 50);
    };

    tick();
  }

  swapLocations() {
    if (!this.isBrowser) return;

    // swap coords
    const tmp = this.origin;
    this.origin = this.destination;
    this.destination = tmp;

    // swap input text
    const t = this.originInput.nativeElement.value;
    this.originInput.nativeElement.value = this.destInput.nativeElement.value;
    this.destInput.nativeElement.value = t;

    if (this.origin) this.center = this.origin;
    else if (this.destination) this.center = this.destination;

    // recalcular ruta
    this.tryRoute();
  }
}