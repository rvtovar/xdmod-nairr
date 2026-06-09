/**
 * NAIRR Reports Module for XDMoD Portal
 * @author Alex Tovar (rvtovar)
 * @date 2025-10-08
 * @updateDate 2026-04-02
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
 * - Viewing reports within tab and downloaded from tbar
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
    function buildQuery(year, month, extra) {
      const params = [];

      if (year) params.push("year=" + encodeURIComponent(year));
      if (month) params.push("month=" + encodeURIComponent(month));

      if (extra) {
        for (var k in extra) {
          if (extra[k] != null) {
            params.push(k + "=" + encodeURIComponent(extra[k]));
          }
        }
      }

      return params.length ? "?" + params.join("&") : "";
    }
    function formatReportTitle(reportId) {
      const parts = reportId.split("_");
      const params = getHashParams();
      // Get year and month from the end

      // Remaining parts are the report title
      let titleParts = parts.slice(0, parts.length - 2);

      // Remove version like "v2"
      titleParts = titleParts.filter((p) => !/^v\d+$/i.test(p));

      // Capitalize first 2 words fully, rest normally
      const formattedTitle = titleParts
        .map((p, idx) => {
          if (idx < 2) return p.toUpperCase(); // first two words fully uppercase
          return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        })
        .join(" ");

      return `${params.month}, ${params.year} ${formattedTitle}`;
    }
    function triggerReportDownload(reportId, year, month) {
      const url =
        XDMoD.REST.prependPathBase("/custom_reports/report/") +
        reportId +
        buildQuery(year, month);

      let iframe = document.getElementById("nairr_report_download_iframe");

      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.id = "nairr_report_download_iframe";
        document.body.appendChild(iframe);
      }

      iframe.src = url;
    }
    function showReportPreview(reportId, year, month) {
      const url =
        XDMoD.REST.prependPathBase("/custom_reports/report/") +
        reportId +
        buildQuery(year, month, { view: "inline" });

      mainArea.getLayout().setActiveItem(previewPanel);
      mainArea.setTitle(formatReportTitle(reportId) + " Preview");

      previewPanel.reportId = reportId;
      previewPanel.body.update(
        '<iframe src="' +
          url +
          '" frameborder="0" style="display:block;width:100%;height:100%;"></iframe>',
      );
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
    function showMessage(container, msg) {
      container.body.update(
        '<div class="no-reports-container">' +
          '<div class="no-reports-icon">&#9888;</div>' +
          '<div class="no-reports-title">' +
          msg +
          "</div></div>",
      );
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

        if (clickNode) {
          monthNode.fireEvent("click", monthNode);
        }
      });
    }
    function createDownloadButton(getReportIdFn) {
      return new Ext.Button({
        text: "Download",
        iconCls: "btn_download",
        tooltip: "Download Selected Report",
        handler: function () {
          var p = getHashParams();
          var reportId = getReportIdFn();

          if (!reportId) return;

          triggerReportDownload(reportId, p.year, p.month);
        },
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

      lastLoaded = {
        year,
        month,
        report_id: report_id || null,
      };

      if (!year || !month) return;

      pendingReportId = report_id || null;

      reportStore.proxy.conn.url = buildReportUrl(year, month);

      reportStore.load({
        callback: function (records, op, success) {
          mainArea.setTitle(`NAIRR Reports for ${month} ${year}`);

          reportContainer.body.unmask();

          if (!success) {
            showMessage(
              reportContainer,
              "Failed to load reports. Please try again.",
            );
            return;
          }

          if (!records || records.length === 0) {
            showMessage(reportContainer, "No reports available.");
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
      proxy: new Ext.data.HttpProxy({
        url: initialUrl,
        method: "GET",
      }),
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
          showMessage(reportContainer, "No reports available.");
          return;
        }

        this.body.update("");

        Ext.each(records, function (record) {
          const report = record.data;

          var btnViewReport = new Ext.Button({
            iconCls: "btn_preview",
            text: "Preview",
            tooltip: "See a visual representation of the selected report.",
            handler: function () {
              var p = getHashParams();
              showReportPreview(report.name, p.year, p.month);
            },
          });
          const panel = new Ext.Panel({
            title: report.title,
            cls: "custom-report-panel",

            tbar: {
              items: [
                createDownloadButton(function () {
                  return report.name;
                }),
                btnViewReport,
              ],
            },

            html: `
              <div class="custom-report-thumb-wrap" id="${report.name}">
                <div class="custom-report-thumb">
                  <img
                    src="${XDMoD.REST.prependPathBase(
                      "/custom_reports/thumbnail/",
                    )}${report.name}${getCustomReportQueryString()}"
                    title="${report.name}"
                  />
                </div>
                <div class="custom-report-thumb-desc">
                  <h2 class="custom-report-thumb-title">
                    ${report.title}
                  </h2>
                  <p>Version: ${report.version}</p>
                  <p>${report.description}</p>
                  <p>Created At ${report.timestamp}</p>
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

    const btnGoBack = new Ext.Button({
      iconCls: "btn_return_to_previous",
      text: "Go Back NAIRR Reports",
      tooltip: "Go back to previous reports",
      handler: function () {
        var p = getHashParams();
        mainArea.getLayout().setActiveItem(reportContainer);
        mainArea.setTitle("NAIRR Reports for " + p.month + " " + p.year);
      },
    });

    const previewPanel = new Ext.Panel({
      id: "nairr_report_preview_panel",
      region: "center",
      layout: "fit",
      autoScroll: false,
      html: "",
      tbar: {
        items: [
          createDownloadButton(function () {
            return previewPanel.reportId;
          }),
          "->",
          btnGoBack,
        ],
      },
      listeners: {
        afterrender: function (p) {
          p.body.setStyle("overflow", "hidden");
        },
      },
    });
    const mainArea = new Ext.Panel({
      id: "nairr_reports_main_panel",
      title: `NAIRR Reports for ${defaultMonth} ${defaultYear}`,
      region: "center",
      layout: "card",
      activeItem: 0,
      items: [reportContainer, previewPanel],
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

      root: new Ext.tree.AsyncTreeNode({
        text: "Reports",
        expanded: true,
      }),

      listeners: {
        click: function (node) {
          if (!node.isLeaf()) return;

          let year = node.parentNode.text;
          let month = node.text;

          setHashParams({ year, month });
          mainArea.getLayout().setActiveItem(reportContainer);
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

          if (!params.year && !params.month && window._tabHashParams[TAB_ID]) {
            params = window._tabHashParams[TAB_ID];
            setHashParams(params);
            return;
          }

          if (!params.year && !params.month) {
            setHashParams({
              year: defaultYear,
              month: defaultMonth,
            });
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
