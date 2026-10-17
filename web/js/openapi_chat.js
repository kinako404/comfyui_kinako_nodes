// 兼容新旧前端：新版通过 window.comfyAPI 暴露 app，旧版没有该对象时直接跳过，
// 避免扩展加载报错影响节点列表显示。
const app = window.comfyAPI?.app?.app;

if (app) {
const MAX_IMAGES = 8;
const IMAGE_RE = /^image_\d+$/;
// LiteGraph.INPUT === 1
const INPUT = 1;

function imageInputs(node) {
    if (!node.inputs) {
        node.inputs = [];
    }
    return node.inputs.filter((inp) => IMAGE_RE.test(inp.name));
}

// 紧凑化图像输入槽：保留所有已连接的槽 + 末尾恰好一个空槽，
// 其余空槽（包括中间的空洞）删除，再按顺序重命名为 image_1..image_n。
// 已连接的槽只被重命名，不会被删除，连线跟随槽对象不受影响。
function updateImageInputs(node) {
    if (!node.inputs) {
        node.inputs = [];
    }
    const imgs = imageInputs(node);

    let lastConnectedPos = -1;
    imgs.forEach((inp, pos) => {
        if (inp.link != null) {
            lastConnectedPos = pos;
        }
    });

    const toRemove = new Set();
    let keptTrailingEmpty = false;
    imgs.forEach((inp, pos) => {
        if (inp.link != null) {
            return;
        }
        if (pos > lastConnectedPos && !keptTrailingEmpty) {
            keptTrailingEmpty = true;
            return;
        }
        toRemove.add(inp);
    });
    for (let idx = node.inputs.length - 1; idx >= 0; idx--) {
        if (toRemove.has(node.inputs[idx])) {
            node.removeInput(idx);
        }
    }

    imageInputs(node).forEach((inp, i) => {
        inp.name = "image_" + (i + 1);
        // 清掉缓存的显示名，让界面显示新名字
        delete inp.label;
        delete inp.localized_name;
    });

    const current = imageInputs(node);
    const last = current[current.length - 1];
    if ((!last || last.link != null) && current.length < MAX_IMAGES) {
        node.addInput("image_" + (current.length + 1), "IMAGE");
    }
    refreshSize(node);
}

// 高度跟随内容，宽度只增不减：保留用户手动拖宽的尺寸
function refreshSize(node) {
    const min = node.computeSize();
    const width = node.size ? Math.max(node.size[0], min[0]) : min[0];
    node.setSize([width, min[1]]);
}

app.registerExtension({
    name: "Kinako.OpenAPISimpleChat",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "OpenAPISimpleChat") {
            return;
        }

        nodeType.prototype.onNodeCreated = function () {
            // INPUT_TYPES 声明了 image_1..image_8，初始只保留 image_1 一个空槽
            for (let idx = this.inputs.length - 1; idx >= 0; idx--) {
                if (IMAGE_RE.test(this.inputs[idx].name) && this.inputs[idx].name !== "image_1") {
                    this.removeInput(idx);
                }
            }
            this.setSize(this.computeSize());
            // 默认宽一点，长 URL / 模型名不至于换行
            this.size[0] = Math.max(this.size[0], 420);

            this.addWidget("button", "获取模型列表", null, async () => {
                const baseUrlWidget = this.widgets.find((w) => w.name === "base_url");
                const apiKeyWidget = this.widgets.find((w) => w.name === "api_key");
                const modelWidget = this.widgets.find((w) => w.name === "model");
                try {
                    const resp = await app.api.fetchApi("/kinako/openapi/models", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            base_url: baseUrlWidget.value,
                            api_key: apiKeyWidget.value,
                        }),
                    });
                    const data = await resp.json();
                    if (!resp.ok) {
                        alert("获取模型列表失败: " + (data.error || resp.status));
                        return;
                    }
                    if (!data.models || data.models.length === 0) {
                        alert("接口返回了空的模型列表");
                        return;
                    }
                    modelWidget.options.values = data.models;
                    if (!data.models.includes(modelWidget.value)) {
                        modelWidget.value = data.models[0];
                    }
                    this.graph?.setDirtyCanvas(true, true);
                } catch (e) {
                    alert("获取模型列表失败: " + e);
                }
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            origOnConfigure?.apply(this, arguments);
            // 加载工作流：把保存的模型值合并回下拉列表，避免值被重置。
            // 用新数组替换而不是 push：options.values 可能与同类型其它节点共享同一个数组
            const modelWidget = this.widgets?.find((w) => w.name === "model");
            const values = modelWidget?.options?.values;
            if (Array.isArray(values) && modelWidget.value && !values.includes(modelWidget.value)) {
                modelWidget.options.values = [...values, modelWidget.value];
            }
            // 加载工作流：恢复图像槽数量并紧凑化
            updateImageInputs(this);
        };

        const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type) {
            origOnConnectionsChange?.apply(this, arguments);
            if (type === INPUT) {
                updateImageInputs(this);
            }
        };
    },
});
}
