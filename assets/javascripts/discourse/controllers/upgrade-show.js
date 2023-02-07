import Repo from "discourse/plugins/docker_manager/discourse/models/repo";
import Controller from "@ember/controller";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import I18n from "I18n";
import { bind } from "discourse-common/utils/decorators";

export default class UpgradeShow extends Controller {
  @service messageBus;
  @service dialog;

  @tracked output = "";
  @tracked status = null;
  @tracked percent = 0;

  get complete() {
    return this.status === "complete";
  }

  get failed() {
    return this.status === "failed";
  }

  get multiUpgrade() {
    return this.model.length !== 1;
  }

  get title() {
    if (this.multiUpgrade) {
      return I18n.t("admin.docker.upgrade_everything");
    } else {
      return I18n.t("admin.docker.upgrade_repo", { name: this.model[0].name });
    }
  }

  get isUpToDate() {
    return this.model.every((repo) => repo.upToDate);
  }

  get upgrading() {
    return this.model.some((repo) => repo.upgrading);
  }

  get repos() {
    return this.isMultiple ? this.model : [this.model];
  }

  @bind
  messageReceived(msg) {
    switch (msg.type) {
      case "log":
        this.output = this.output + msg.value + "\n";
        break;
      case "percent":
        this.percent = msg.value;
        break;
      case "status":
        this.status = msg.value;

        if (msg.value === "complete") {
          this.model
            .filter((repo) => repo.upgrading)
            .forEach((repo) => {
              repo.version = repo.latest?.version;
            });
        }

        if (msg.value === "complete" || msg.value === "failed") {
          for (const repo of this.model) {
            repo.upgrading = false;
          }
        }

        break;
    }
  }

  startBus() {
    this.messageBus.subscribe("/docker/upgrade", this.messageReceived);
  }

  stopBus() {
    this.messageBus.unsubscribe("/docker/upgrade", this.messageReceived);
  }

  reset() {
    this.output = "";
    this.status = null;
    this.percent = 0;
  }

  @action
  start() {
    this.reset();

    if (this.multiUpgrade) {
      this.model
        .filter((repo) => !repo.upToDate)
        .forEach((repo) => (repo.upgrading = true));

      return Repo.upgradeAll();
    }

    const repo = this.model[0];
    if (repo.upgrading) {
      return;
    }

    repo.startUpgrade();
  }

  @action
  resetUpgrade() {
    const message = I18n.t("admin.docker.reset_warning");

    this.dialog.confirm({
      message,
      didConfirm: async () => {
        if (this.multiUpgrade) {
          try {
            await Repo.resetAll(this.model.filter((repo) => !repo.upToDate));
          } finally {
            this.reset();

            for (const repo of this.model) {
              repo.upgrading = false;
            }

            return;
          }
        }

        const repo = this.model[0];
        await repo.resetUpgrade();
        this.reset();
      },
    });
  }
}
