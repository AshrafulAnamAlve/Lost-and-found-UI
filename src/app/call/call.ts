import { Component, Directive, ElementRef, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService } from '../call.service';

/** Bind a MediaStream to a <video> element (Angular can't bind srcObject directly). */
@Directive({ selector: 'video[srcObject]' })
export class SrcObjectDirective {
  private el: ElementRef<HTMLVideoElement> = inject(ElementRef);
  @Input() set srcObject(stream: MediaStream | null) {
    this.el.nativeElement.srcObject = stream;
  }
}

@Component({
  selector: 'app-call',
  imports: [CommonModule, SrcObjectDirective],
  templateUrl: './call.html',
  styleUrl: './call.css',
})
export class Call {
  call = inject(CallService);
}
