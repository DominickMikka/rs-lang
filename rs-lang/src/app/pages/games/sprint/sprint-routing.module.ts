import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SprintComponent } from './sprint.component';

const routes: Routes = [{ path: '', component: SprintComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SprintRoutingModule { }
