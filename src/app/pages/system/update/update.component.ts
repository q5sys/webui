import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RestService, WebSocketService, SystemGeneralService } from '../../../services/';
import { EntityJobComponent } from '../../common/entity/entity-job/entity-job.component';
import { MatDialog, MatSnackBar } from '@angular/material';
import { DialogService } from '../../../services/dialog.service';
import { AppLoaderService } from '../../../services/app-loader/app-loader.service';
import { TranslateService } from '@ngx-translate/core';
import { T } from '../../../translate-marker';
import { FieldConfig } from '../../common/entity/entity-form/models/field-config.interface';
import { EntityUtils } from '../../../pages/common/entity/utils';

import { DialogFormConfiguration } from '../../common/entity/entity-dialog/dialog-form-configuration.interface';
import { helptext_system_update as helptext } from 'app/helptext/system/update';

@Component({
  selector: 'app-update',
  styleUrls: ['update.component.css'],
  templateUrl: './update.component.html',
})
export class UpdateComponent implements OnInit, OnDestroy {

  public packages: any[] = [];
  public status: string;
  public releaseNotes: any = '';
  public changeLog: any = '';
  public updating = false;
  public updated = false;
  public progress: Object = {};
  public job: any = {};
  public error: string;
  public autoCheck = false;
  public train: string;
  public trains: any[]=[];
  public selectedTrain;
  public general_update_error;
  public update_downloaded=false;
  public train_msg = {
    "NIGHTLY_DOWNGRADE": T("Changing away from the nightly train is considered a downgrade and not a supported operation. Activate an existing boot environment that uses the desired train and boot into it to switch to that train."),
    "MINOR_DOWNGRADE": T("Changing the minor version is considered a downgrade and is not a supported operation. Activate an existing boot environment that uses the desired train and boot into it to switch to that train."),
    "MAJOR_DOWNGRADE": T("Changing the major version is considered a downgrade and is not a supported operation. Activate an existing boot environment that uses the desired train and boot into it to switch to that train."),
    "SDK": T("Changing SDK version is not a supported operation. Activate an existing boot environment that uses the desired train and boot into it to switch to that train."),
    "NIGHTLY_UPGRADE": T("Changing to a nightly train is one-way. Changing back to a stable train is not supported!")
  }
  public release_train: boolean;
  public pre_release_train: boolean;
  public nightly_train: boolean;
  public updates_available = false;
  public currentTrainDescription: string;
  public trainDescriptionOnPageLoad: string;
  public fullTrainList: any[];
  public isFooterConsoleOpen: boolean;
  public isUpdateRunning = false;
  public updateMethod: string = 'update.update';
  public is_ha = false;
  public isfreenas: boolean;
  public ds: any;
  public failover_upgrade_pending = false;
  public busy: Subscription;
  public busy2: Subscription;
  private checkChangesSubscription: Subscription;
  public showSpinner: boolean = false;
  public singleDescription: string;
  sysUpdateMessage = T('A system update is in progress. ') + helptext.sysUpdateMessage;
  public updatecheck_tooltip = T('Check the update server daily for \
                                  any updates on the chosen train. \
                                  Automatically download an update if \
                                  one is available. Click \
                                  <i>APPLY PENDING UPDATE</i> to install \
                                  the downloaded update.');

  protected saveConfigFieldConf: FieldConfig[] = [
    {
      type: 'checkbox',
      name: 'secretseed',
      placeholder: T('Include Password Secret Seed')
    },
  ];
  public saveConfigFormConf: DialogFormConfiguration = {
    title: T("Save configuration settings from this machine before updating?"),
    message: T("<b>WARNING:</b> This configuration file contains system\
              passwords and other sensitive data.<br>"),
    fieldConfig: this.saveConfigFieldConf,
    warning: T("Including the Password Secret Seed allows using this\
              configuration file with a new boot device. It also\
              decrypts all passwords used on this system.\
              <b>Keep the configuration file safe and protect it from unauthorized access!</b>"),
    method_ws: 'core.download',
    saveButtonText: T('SAVE CONFIGURATION'),
    cancelButtonText: T('NO'),
    customSubmit: this.saveConfigSubmit,
  };

  protected dialogRef: any;
  constructor(protected router: Router, protected route: ActivatedRoute, protected snackBar: MatSnackBar,
    protected rest: RestService, protected ws: WebSocketService, protected dialog: MatDialog, public sysGenService: SystemGeneralService,
    protected loader: AppLoaderService, protected dialogService: DialogService, public translate: TranslateService) {
      this.sysGenService.updateRunning.subscribe((res) => { 
        res === 'true' ? this.isUpdateRunning = true : this.isUpdateRunning = false });
  }

  parseTrainName(name) {
    const version = []
    let sw_version = "";
    let branch = "";
    let split = ""
    let sdk = ""
    if (name.match(/-SDK$/)){
      split = name.split('-');
      sw_version = split[1];
      branch = split[2];
      sdk = split[3];
      version.push(sw_version);
      version.push(branch);
      version.push(sdk);
    }
    else {
      split = name.split('-');
      sw_version = split[1];
      branch = split[2];
      version.push(sw_version);
      version.push(branch);
    }
    return version;
  }

  compareTrains(t1, t2) {
    const v1 = this.parseTrainName(t1)
    const v2 = this.parseTrainName(t2);

    try {
      if(v1[0] !== v2[0] || v1[1] !== v2[1]) {

        const version1 = v1[0].split('.');
        const version2 = v2[0].split('.');
        const branch1 = v1[1].toLowerCase();
        const branch2 = v2[1].toLowerCase();

        if(branch1 !== branch2) {

          if(branch2 === "nightlies") {
            return "NIGHTLY_UPGRADE";
          } else if(branch1 === "nightlies") {
            return "NIGHTLY_DOWNGRADE";
          }
        } else {
          if(version2[0] ==="HEAD"){
            return "ALLOWED"
          }
        }

        if (version1[0] === version2[0]){
          // comparing '11' .1 with '11' .2
          if(version1[1] && version2[1]){
            if (version1[1] === version2[1]) {
              //upgrading to train of same version;
              return "ALLOWED";
            }
            //comparing '.1' with '.2'
            return version1[1] > version2[1] ? "MINOR_UPGRADE":"MINOR_DOWNGRADE";
          }
          if(version1[1]){
            //handling a case where '.1' is compared with 'undefined'
            return "MINOR_DOWNGRADE"
          }
          if(version2[1]){
            //comparing '.1' with '.2'
            return "MINOR_UPGRADE"
          }

        } else {
          // comparing '9' .10 with '11' .2
          return version1[0] > version2[0] ? "MAJOR_UPGRADE":"MAJOR_DOWNGRADE";
        }

      } else {
        if(v1[0] === v2[0]&&v1[1] !== v2[1]){
          const branch1 = v1[1].toLowerCase();
          const branch2 = v2[1].toLowerCase();
          if(branch1 !== branch2) {

            if(branch2 === "nightlies") {
              return "NIGHTLY_UPGRADE";
            } else if(branch1 === "nightlies") {
              return "NIGHTLY_DOWNGRADE";
            }
          } else {
            if(branch2 === "nightlies" && branch1 === "nightlies") {

            }

          }
        }
        else {
          if(v2[2]||v1[2]){
            return "SDK"
          }
        }

      }
    } catch (e) {
      console.error("Failed to compare trains", e);
    }
  }

  ngOnInit() {
    window.localStorage.getItem('is_freenas') === 'true' ? this.isfreenas = true : this.isfreenas = false;

    this.busy = this.rest.get('system/update', {}).subscribe((res) => {
      this.autoCheck = res.data.upd_autocheck;

      this.busy2 = this.ws.call('update.get_trains').subscribe((res) => {
        this.fullTrainList = res.trains;
  
        // On page load, make sure we are working with train of the current OS
        this.train = res.current;
        this.selectedTrain = res.current;
  
        if (this.autoCheck) {
          this.check();
        }
  
        this.trains = [];
        for (const i in res.trains) {
          if (this.compareTrains(this.train, i) === 'ALLOWED' || 
          this.compareTrains(this.train, i) === 'NIGHTLY_UPGRADE' || 
          this.compareTrains(this.train, i) === 'MINOR_UPGRADE' || 
          this.compareTrains(this.train, i) === 'MAJOR_UPGRADE' || 
          this.train === i) {
            this.trains.push({ name: i, description: res.trains[i].description });
          }
        }
        this.singleDescription = this.trains[0].description;
        
        if (this.fullTrainList[res.current]) {
          if (this.fullTrainList[res.current].description.toLowerCase().includes('[nightly]')) {
            this.currentTrainDescription = '[nightly]';
          } else if (this.fullTrainList[res.current].description.toLowerCase().includes('[release]')) {
            this.currentTrainDescription = '[release]';
          } else if (this.fullTrainList[res.current].description.toLowerCase().includes('[prerelease]')) {
            this.currentTrainDescription = '[prerelease]';
          } else {
            this.currentTrainDescription = res.trains[this.selectedTrain].description.toLowerCase();
          }
        } else { 
            this.currentTrainDescription = '';
        }
        // To remember train descrip if user switches away and then switches back
        this.trainDescriptionOnPageLoad = this.currentTrainDescription;
      });
    });

    this.ws.call('system.advanced.config').subscribe((res)=> {
      if (res) {
        this.isFooterConsoleOpen = res.consolemsg;
      }
    });

    if (!this.isfreenas) {
      setTimeout(() => { // To get around too many concurrent calls???
        this.ws.call('failover.licensed').subscribe((res) => {
          if (res) {
            this.updateMethod = 'failover.upgrade';
            this.is_ha = true;
          };
          this.checkForUpdateRunning();
        });        
      })

    } else {
      this.checkForUpdateRunning();
    }
  }

  checkForUpdateRunning() {
    this.ws.call('core.get_jobs', [[["method", "=", this.updateMethod], ["state", "=", "RUNNING"]]]).subscribe(
      (res) => {
        if (res && res.length > 0) {
          this.isUpdateRunning = true;
          this.showRunningUpdate(res[0].id);
        }
      },
      (err) => {
        console.error(err);
      });
  }

  checkUpgradePending() {
    this.ws.call('failover.upgrade_pending').subscribe((res) => {
      this.failover_upgrade_pending = res;
    })
  }

  applyFailoverUpgrade() {
    this.dialogService.confirm(T("Finish Upgrade?"), T(""), true, T("Continue")).subscribe((res) => {
      if (res) {
        this.dialogRef = this.dialog.open(EntityJobComponent, { data: { "title": T("Update") }, disableClose: false });
        this.dialogRef.componentInstance.setCall('failover.upgrade_finish');
        this.dialogRef.componentInstance.submit();
        this.dialogRef.componentInstance.success.subscribe((success) => {
          console.info('success', success)
          this.failover_upgrade_pending = false;
          this.dialogRef.close(false);
        });
        this.dialogRef.componentInstance.failure.subscribe((failure) => {
          this.dialogService.errorReport(failure.error, failure.reason, failure.trace.formatted);
        });
      }
    })
  }

  onTrainChanged(event) {
    // For the case when the user switches away, then BACK to the train of the current OS
    if (event === this.selectedTrain) {
      this.currentTrainDescription = this.trainDescriptionOnPageLoad;
      this.setTrainAndCheck();
      return;
    }

    const compare = this.compareTrains(this.selectedTrain, event);
    if(compare === "NIGHTLY_DOWNGRADE" || compare === "MINOR_DOWNGRADE" || compare === "MAJOR_DOWNGRADE" || compare ==="SDK") {
      this.dialogService.Info("Error", this.train_msg[compare]).subscribe((res)=>{
        this.train = this.selectedTrain;
      })
    } else if(compare === "NIGHTLY_UPGRADE"){
        this.dialogService.confirm(T("Warning"), this.train_msg[compare]).subscribe((res)=>{
          if (res){
            this.train = event;
            this.setTrainDescription();
            this.setTrainAndCheck();
          } else {
            this.train = this.selectedTrain;
            this.setTrainDescription();
          }
        })
    } else if (compare === "ALLOWED" || compare === "MINOR_UPGRADE" || compare === "MAJOR_UPGRADE") {
      this.dialogService.confirm(T("Switch Train"), T("Switch update trains?")).subscribe((train_res)=>{
        if(train_res){
          this.train = event;
          this.setTrainDescription();
          this.setTrainAndCheck();
        }
      })
    }
  }

  setTrainDescription() {
    if (this.fullTrainList[this.train]) {
      this.currentTrainDescription = this.fullTrainList[this.train].description.toLowerCase();
    } else {
      this.currentTrainDescription = '';
    }
  }

  toggleAutoCheck() {
    this.busy =
      this.rest
      .put('system/update', { body: JSON.stringify({ upd_autocheck: this.autoCheck }) })
      .subscribe((res) => {
        if(res.data.upd_autocheck === true) {
          this.check();
        }
      });
  }

  showRunningUpdate(jobId) {
    this.dialogRef = this.dialog.open(EntityJobComponent, { data: { "title": "Update" }, disableClose: true });
    if (this.is_ha) {
      this.dialogRef.componentInstance.disableProgressValue(true);
    };
    this.dialogRef.componentInstance.jobId = jobId;
    this.dialogRef.componentInstance.wsshow();
    this.dialogRef.componentInstance.success.subscribe((res) => {
      this.router.navigate(['/others/reboot']);
    });
    this.dialogRef.componentInstance.failure.subscribe((err) => {
      new EntityUtils().handleWSError(this, err, this.dialogService);
    });
  }

  startUpdate() {
    this.error = null;
    this.loader.open();
    this.ws.call('update.check_available')
      .subscribe(
        (res) => {
          this.loader.close();
          this.status = res.status;
          if (res.status === 'AVAILABLE') {
            this.packages = [];
            res.changes.forEach((item) => {
              if (item.operation === 'upgrade') {
                this.packages.push({
                  operation: 'Upgrade',
                  name: item.old.name + '-' + item.old.version +
                    ' -> ' + item.new.name + '-' +
                    item.new.version,
                });
              } else if (item.operation === 'install') {
                this.packages.push({
                  operation: 'Install',
                  name: item.new.name + '-' + item.new.version,
                });
              } else if (item.operation === 'delete') {
                // FIXME: For some reason new is populated instead of
                // old?
                if (item.old) {
                  this.packages.push({
                    operation: 'Delete',
                    name: item.old.name + '-' + item.old.version,
                  });
                } else if (item.new) {
                  this.packages.push({
                    operation: 'Delete',
                    name: item.new.name + '-' + item.new.version,
                  });
                }
              } else {
                console.error("Unknown operation:", item.operation)
              }
            });
            if (res.changelog) {
              this.changeLog = res.changelog.replace(/\n/g, '<br>');
            }
            if (res.notes) {
              this.releaseNotes = res.notes.ReleaseNotes;
            }
            this.dialogService.dialogForm(this.saveConfigFormConf).subscribe(()=>{
              if (!this.is_ha) {
                this.ds  = this.dialogService.confirm(
                  T("Download Update"), T("Continue with download?"),true,"",true,
                    T("Apply updates and reboot system after downloading."),
                    'update.update',[{ train: this.train, reboot: false }]
                )
                this.ds.afterClosed().subscribe((status)=>{
                  if(status){
                    if (!this.is_ha && !this.ds.componentInstance.data[0].reboot){
                      this.dialogRef = this.dialog.open(EntityJobComponent, { data: { "title": T("Update") }, disableClose: false });
                      this.dialogRef.componentInstance.setCall('update.download');
                      this.dialogRef.componentInstance.submit();
                      this.dialogRef.componentInstance.success.subscribe((succ) => {
                        this.dialogRef.close(false);
                        this.snackBar.open(T("Updates successfully downloaded"),'close', { duration: 5000 });
                        this.pendingupdates();

                      });
                      this.dialogRef.componentInstance.failure.subscribe((err) => {
                        new EntityUtils().handleWSError(this, err, this.dialogService);
                      });
                    }
                    else{
                      this.update();
                    }
                  }
                });
                } else {
                  this.ds  = this.dialogService.confirm(
                    T("Download Update"), T("Upgrades both controllers. Files are downloaded to the Active Controller\
                      and then transferred to the Standby Controller. The upgrade process starts concurrently on both TrueNAS Controllers.\
                      Continue with download?"),true).subscribe((res) =>  {
                      if (res) {
                        this.update()
                      };
                    });
                };
            });
          } else if (res.status === 'UNAVAILABLE'){
            this.dialogService.Info(T('Check Now'), T('No updates available.'))
          }
        },
        (err) => {
          this.loader.close();
          new EntityUtils().handleWSError(this, err, this.dialogService);
          this.dialogService.errorReport(T("Error checking for updates."), err.reason, err.trace.formatted);
        },
        () => {
          this.loader.close();
        });
  };

  downloadUpdate() {
    this.ws.call('core.get_jobs', [[["method", "=", this.updateMethod], ["state", "=", "RUNNING"]]]).subscribe(
      (res) => {
        if (res[0]) {
          this.showRunningUpdate(res[0].id);
        } else {
          this.startUpdate();
        }
      },
      (err) => {
        new EntityUtils().handleWSError(this, err, this.dialogService);
      });
  }

  update() {
    this.sysGenService.updateRunningNoticeSent.emit();
    this.dialogRef = this.dialog.open(EntityJobComponent, { data: { "title": "Update" }, disableClose: true });
    if (!this.is_ha) {
      this.dialogRef.componentInstance.setCall('update.update', [{ train: this.train, reboot: false }]);
      this.dialogRef.componentInstance.submit();
      this.dialogRef.componentInstance.success.subscribe((res) => {
        this.router.navigate(['/others/reboot']);
      });
      this.dialogRef.componentInstance.failure.subscribe((res) => {
        this.dialogService.errorReport(res.error, res.reason, res.trace.formatted);
      });
    } else {
      this.ws.call('update.set_train', [this.train]).subscribe(() => { 
        this.dialogRef.componentInstance.setCall('failover.upgrade');
        this.dialogRef.componentInstance.disableProgressValue(true);
        this.dialogRef.componentInstance.submit();
        this.dialogRef.componentInstance.success.subscribe((res) => {
          if (!this.is_ha) { 
            this.router.navigate(['/others/reboot']); 
          } else  {
            this.dialogService.closeAllDialogs();
            this.router.navigate(['/']); 
            this.dialogService.confirm(helptext.ha_update.complete_title, 
              helptext.ha_update.complete_msg, true, 
              helptext.ha_update.complete_action,false, '','','','', true).subscribe(() => {
              });
          }
        });
        this.dialogRef.componentInstance.failure.subscribe((err) => {
          new EntityUtils().handleWSError(this, err, this.dialogService);
        })
      })
    };
  }

  ApplyPendingUpdate() {
    this.dialogService.dialogForm(this.saveConfigFormConf).subscribe(()=>{
      this.dialogService.confirm(
        T("Apply Pending Updates"), T("The system will reboot and be briefly unavailable while applying updates. Apply updates and reboot?")
      ).subscribe((res)=>{
        if(res){
          this.update();
        };
      });
    });
  };

  ManualUpdate() {
    this.dialogService.dialogForm(this.saveConfigFormConf).subscribe(()=>{
      this.router.navigate([this.router.url +'/manualupdate']);
    });
  };

  pendingupdates() {
    this.ws.call('update.get_pending').subscribe((pending)=>{
      if(pending.length !== 0){
        this.update_downloaded = true;
      }
    });
  }

  setTrainAndCheck() {
    this.showSpinner = true;
    this.ws.call('update.set_train', [this.train]).subscribe(() => { 
      this.check();
    },(err) => {
      new EntityUtils().handleWSError(this, err, this.dialogService);
      this.showSpinner = false;
    },
    () => {
      this.showSpinner = false;
    });
  }

  check() {
    // Reset the template
    this.updates_available = false; 
    this.releaseNotes = '';

    this.showSpinner = true;
    this.pendingupdates();
    this.error = null;
    this.ws.call('update.check_available')
      .subscribe(
        (res) => {
          this.status = res.status;
          if (res.status === 'AVAILABLE') {
            this.updates_available = true;
            this.packages = [];
            res.changes.forEach((item) => {
              if (item.operation === 'upgrade') {
                this.packages.push({
                  operation: 'Upgrade',
                  name: item.old.name + '-' + item.old.version +
                    ' -> ' + item.new.name + '-' +
                    item.new.version,
                });
              } else if (item.operation === 'install') {
                this.packages.push({
                  operation: 'Install',
                  name: item.new.name + '-' + item.new.version,
                });
              } else if (item.operation === 'delete') {
                if (item.old) {
                  this.packages.push({
                    operation: 'Delete',
                    name: item.old.name + '-' + item.old.version,
                  });
                } else if (item.new) {
                  this.packages.push({
                    operation: 'Delete',
                    name: item.new.name + '-' + item.new.version,
                  });
                }
              } else {
                console.error("Unknown operation:", item.operation)
              }
            });

            if (res.changelog) {
              this.changeLog = res.changelog.replace(/\n/g, '<br>');
            }
            if (res.notes) {
              this.releaseNotes = res.notes.ReleaseNotes;
            }
          }
          if (this.currentTrainDescription.includes('[release]')) {
            this.release_train = true;
            this.pre_release_train = false;
            this.nightly_train = false;
          } else if(this.currentTrainDescription.includes('[prerelease]')) {
            this.release_train = false;
            this.pre_release_train = true;
            this.nightly_train = false;
          } else {
            this.release_train = false;
            this.pre_release_train = false;
            this.nightly_train = true;
          }
          this.showSpinner = false;
        },
        (err) => {
          this.general_update_error =  err.reason.replace('>', '').replace('<','') + T(": Automatic update check failed. Please check system network settings.");
          this.showSpinner = false;
        },
        () => {
          this.showSpinner = false;
        });
  }

  async saveConfigSubmit(entityDialog) {
    await entityDialog.ws.call('system.info', []).subscribe((res) => {
      let fileName = "";
      if (res) {
        const hostname = res.hostname.split('.')[0];
        const date = entityDialog.datePipe.transform(new Date(),"yyyyMMddHHmmss");
        fileName = hostname + '-' + date;
        if (entityDialog.formValue['secretseed']) {
          fileName += '.tar';
        } else {
          fileName += '.db';
        }
      }

      entityDialog.ws.call('core.download', ['config.save', [{ 'secretseed': entityDialog.formValue['secretseed'] }], fileName])
        .subscribe(
          (succ) => {
            if (window.navigator.userAgent.search("Firefox")>0) {
              window.open(succ[1]);
          }
            else {
              window.location.href = succ[1];
            } 
            entityDialog.dialogRef.close();
          },
          (err) => {
            entityDialog.snackBar.open(T("Check the network connection"), T("Failed") , {
              duration: 5000
            });
          }
        );
    });
  }

  ngOnDestroy() {
    if (this.checkChangesSubscription) {
      this.checkChangesSubscription.unsubscribe();
    }
  }
}
