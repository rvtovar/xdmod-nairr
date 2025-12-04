/**
 * NAIRR Reports Module for XDMoD Portal
 * @author Alex Tovar (rvtovar)
 * @date 2025-10-08
 *
 * Overview:
 * This module adds a user interface to the XDMoD Portal for browsing and downloading
 * custom NAIRR reports. It leverages Ext JS 3.4.x idioms and XDMoD's portal conventions.
 *
 * Features:
 * - Remembers and restores last-viewed report period (year/month) per tab using the URL hash.
 * - Supports deep linking, navigation, and report downloads via hash-based state.
 * - Handles tab activation, tree expansion, and async report loading using Ext JS best practices.
 * - Ensures robust UI masking/unmasking and avoids redundant network loads.
 * - All tab/hash management is keyed by the configured tab ID.
 *
 * Usage:
 * - Add this module to the XDMoD Portal config.
 * - No global variables are created except for _tabHashParams to track tab state.
 * - All report navigation and downloads are hash-driven for consistency and shareability.
 */

window._tabHashParams = window._tabHashParams || {};

XDMoD.Module.NairrReports = function (config) {
  this.id = config && config.id ? config.id : "nairr_reports";
  XDMoD.Module.NairrReports.superclass.constructor.call(this, config);
};

Ext.extend(XDMoD.Module.NairrReports, XDMoD.PortalModule, {
  module_id: "nairr_reports",
  usesToolbar: false,

  initComponent: function () {
    const TAB_ID = this.id || "nairr_reports";
    let lastLoaded = { year: null, month: null, report_id: null };

    function buildReportUrl(year, month) {
      return XDMoD.REST.prependPathBase(
        `/custom_reports/reports?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
      );
    }

    function triggerReportDownload(reportId, year, month) {
      const qs = [];
      if (year) qs.push(`year=${encodeURIComponent(year)}`);
      if (month) qs.push(`month=${encodeURIComponent(month)}`);
      const url = `${XDMoD.REST.prependPathBase("/custom_reports/report/")}${reportId}${qs.length ? "?" + qs.join("&") : ""}`;
      let iframe = document.getElementById("nairr_report_download_iframe");
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.id = "nairr_report_download_iframe";
        document.body.appendChild(iframe);
      }
      iframe.src = url;
    }

    function getHashParams() {
      const hash = window.location.hash.split("?")[1] || "";
      const params = new URLSearchParams(hash);
      return {
        year: params.get("year"),
        month: params.get("month"),
        report_id: params.get("report_id"),
      };
    }

    function setHashParams(obj) {
      window._tabHashParams[TAB_ID] = obj;
      const pre =
        window.location.hash.split("?")[0] || `#main_tab_panel:${TAB_ID}`;
      const params = new URLSearchParams();
      if (obj.year) params.set("year", obj.year);
      if (obj.month) params.set("month", obj.month);
      if (obj.report_id) params.set("report_id", obj.report_id);
      window.location.hash = `${pre}?${params.toString()}`;
    }

    const now = new Date();
    let hashParams = getHashParams();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const defaultYear = hashParams.year || prevMonth.getFullYear();
    const defaultMonth =
      hashParams.month ||
      prevMonth.toLocaleString("default", { month: "long" });
    let pendingReportId = hashParams.report_id || null;
    const initialUrl = buildReportUrl(defaultYear, defaultMonth);

    if (!window._nairrReportsHashHandler) {
      window._nairrReportsHashHandler = true;
      window.addEventListener("hashchange", function () {
        let tabPanel = Ext.getCmp("main_tab_panel");
        let activeTab = tabPanel ? tabPanel.getActiveTab() : null;
        if (
          activeTab &&
          (activeTab.id === TAB_ID || activeTab.module_id === TAB_ID)
        ) {
          const params = getHashParams();
          if (params.year && params.month) {
            loadReportsAsync(params.year, params.month, params.report_id);
          }
        }
      });
    }

    function getCustomReportQueryString() {
      let hashParams = getHashParams();
      const year = hashParams.year || defaultYear;
      const month = hashParams.month || defaultMonth;
      const out = [];
      if (year) out.push(`year=${encodeURIComponent(year)}`);
      if (month) out.push(`month=${encodeURIComponent(month)}`);
      return out.length ? "?" + out.join("&") : "";
    }

    function expandAndSelect(tree, year, month, clickNode) {
      const yearNode = tree.getRootNode().findChild("text", String(year));
      if (!yearNode) return;
      yearNode.expand(false, false, function () {
        const monthNode = yearNode.findChild("text", String(month));
        if (!monthNode) return;
        tree.getSelectionModel().select(monthNode);
        monthNode.ensureVisible();
        if (clickNode) monthNode.fireEvent("click", monthNode);
      });
    }

    function loadReportsAsync(year, month, report_id) {
      if (
        lastLoaded.year === year &&
        lastLoaded.month === month &&
        lastLoaded.report_id === (report_id || null)
      ) {
        reportContainer.body.unmask();
        return;
      }
      lastLoaded = { year, month, report_id: report_id || null };

      if (!year || !month) return;
      pendingReportId = report_id || null;
      reportStore.proxy.conn.url = buildReportUrl(year, month);
      reportStore.load({
        callback: function (records, op, success) {
          mainArea.setTitle(`NAIRR Reports for ${month} ${year}`);
          reportContainer.body.unmask();
          if (!success) {
            reportContainer.body.update(`
              <div class="no-reports-container">
                <div class="no-reports-icon">&#9888;</div>
                <div class="no-reports-title">Failed to load reports. Please try again.</div>
              </div>
            `);
            return;
          }
          if (!records || records.length === 0) {
            reportContainer.body.update(`
              <div class="no-reports-container">
                <div class="no-reports-icon">&#9888;</div>
                <div class="no-reports-title">No reports available.</div>
              </div>
            `);
            return;
          }
          reportContainer.updateReports(records);

          if (pendingReportId) {
            const matching = records.find(
              (r) => r.data.name === pendingReportId,
            );
            if (matching) {
              triggerReportDownload(pendingReportId, year, month);
              pendingReportId = null;
              let hashParams = getHashParams();
              delete hashParams.report_id;
              setHashParams(hashParams);
            }
          }
        },
        scope: this,
      });
    }

    const reportStore = new Ext.data.JsonStore({
      autoDestroy: true,
      storeId: "customReportStore",
      root: "report_list",
      idProperty: "name",
      fields: ["name", "version", "title", "description", "timestamp"],
      proxy: new Ext.data.HttpProxy({ url: initialUrl, method: "GET" }),
    });

    const reportContainer = new Ext.Panel({
      id: "nairr_reports_container",
      layout: "auto",
      autoScroll: true,
      region: "center",
      items: [],
      updateReports: function (records) {
        this.removeAll(true);
        if (!records || records.length === 0) {
          this.body.update(`
            <div class="no-reports-container">
              <div class="no-reports-icon">&#9888;</div>
              <div class="no-reports-title">No reports available.</div>
            </div>
          `);
          return;
        }
        this.body.update("");
        Ext.each(records, function (record) {
          const report = record.data;
          const panel = new Ext.Panel({
            title: report.title,
            cls: "custom-report-panel",
            html: `
              <div class="custom-report-thumb-wrap" id="${report.name}">
                <div class="custom-report-thumb">
                  <img src="${XDMoD.REST.prependPathBase("/custom_reports/thumbnail/")}${report.name}${getCustomReportQueryString()}"
                       title="${report.name}" />
                </div>
                <div class="custom-report-thumb-desc">
                  <h2 class="custom-report-thumb-title">${report.title}</h2>
                  <p>Version: ${report.version}</p>
                  <p>${report.description}</p>
                  <p>Created At ${report.timestamp}</p>
                  <div>
                    <p><a href="${XDMoD.REST.prependPathBase("/custom_reports/report/")}${report.name}${getCustomReportQueryString()}" name="${report.name}">Download</a></p>
                  </div>
                </div>
              </div>
            `,
            listeners: {
              afterrender: function (p) {
                p.body.mask("Loading...");
                const img = p.body.dom.querySelector("img");
                if (img) {
                  img.onload = function () {
                    p.body.unmask();
                  };
                  img.onerror = function () {
                    p.body.unmask();
                  };
                } else {
                  p.body.unmask();
                }
              },
            },
          });
          reportContainer.add(panel);
        });
        this.doLayout();
      },
    });

    const mainArea = new Ext.Panel({
      id: "nairr_reports_main_panel",
      title: `NAIRR Reports for ${defaultMonth} ${defaultYear}`,
      region: "center",
      layout: "fit",
      items: [reportContainer],
    });

    const leftPanel = new Ext.tree.TreePanel({
      region: "west",
      width: 200,
      collapsible: true,
      title: "Report Directory",
      rootVisible: false,
      loader: new Ext.tree.TreeLoader({
        dataUrl: XDMoD.REST.prependPathBase("/custom_reports/report-directory"),
        requestMethod: "GET",
      }),
      root: new Ext.tree.AsyncTreeNode({ text: "Reports", expanded: true }),
      listeners: {
        click: function (node) {
          if (!node.isLeaf()) return;
          let year = node.parentNode.text;
          let month = node.text;
          setHashParams({ year, month });
        },
        render: function (tree) {
          tree.getLoader().on("load", function (loader, node) {
            if (node.isRoot) {
              let hashParams = getHashParams();
              expandAndSelect(
                tree,
                hashParams.year || defaultYear,
                hashParams.month || defaultMonth,
                false,
              );
            }
          });
        },
      },
    });

    Ext.apply(this, {
      layout: "border",
      items: [leftPanel, mainArea],
      listeners: {
        activate: function () {
          let params = getHashParams();
          const now = new Date();
          if (!params.year && !params.month && window._tabHashParams[TAB_ID]) {
            params = window._tabHashParams[TAB_ID];
            setHashParams(params);
            return;
          }
          if (!params.year && !params.month) {
            setHashParams({ year: defaultYear, month: defaultMonth });
            return;
          }
          if (params.year && params.month) {
            expandAndSelect(leftPanel, params.year, params.month, false);
            reportContainer.body.mask("Loading...");
            loadReportsAsync(params.year, params.month, params.report_id);
          }
        },
        scope: this,
      },
    });

    XDMoD.Module.NairrReports.superclass.initComponent.apply(this, arguments);
  },
});
