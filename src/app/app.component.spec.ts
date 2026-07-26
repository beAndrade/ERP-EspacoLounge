import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterTestingModule.withRoutes([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have the Espaço Lounge title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('Espaço Lounge');
  });

  it('should render brand with Nexa Beauty wordmark', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const brand = compiled.querySelector('.brand');
    expect(brand?.querySelector('.brand__name')?.textContent?.trim()).toBe(
      'nexa',
    );
    expect(brand?.querySelector('.brand__tag')?.textContent?.trim().toUpperCase()).toBe(
      'BEAUTY',
    );
  });
});
