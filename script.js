const _url = new URL(location.href);

if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(function() {
          console.log('Service Worker Registered');
    });
}

/** @type {HTMLInputElement} */
let filePickerEl;

const app = new Vue({
  el: "#app",
  data: {
    editor: null,
    json: {
      "instructions": [
        "Enter your JSON in the editor.",
        "Select an item to view its path.",
        "Replace 'x' with the name of your letiable."
      ]
    },
    path: "",
    error: "",
    close: true,
    defaultPath: localStorage.getItem("pfj.defaultPath") || "$",
    pathType: localStorage.getItem("pfj.pathType") || "js",
    appName: "JPATH",
    isOptionsOpen: false
  },
  // initialize ace editor and load the reader
  mounted: async function() {
    this.editor = CodeMirror(document.querySelector("#text-editor"),{
      value: JSON.stringify(this.json, null, 2),
      mode: {name:"javascript",json:true},
      theme: "dracula",
      readOnly: false,
      lineNumbers: true,
      lineWrapping: false,
      clickableUrls: true,
      openLinksInNewWindow: true
    });
    this.read();
    this.editor.on("change", ()=>{
      this.read();
    });

    if (_url.searchParams.get("json")) {
      this.editor.setValue(_url.searchParams.get("json"));
    } else if (_url.searchParams.get("fetch")) {
      let fetched = await fetch("https://cors-anywhere.herokuapp.com/"+_url.searchParams.get("fetch"), JSON.parse(_url.searchParams.get("fetch-options") || "{}")).then(d=>d.text());
      this.editor.setValue(fetched);
    }
    this.editorPrettify(true);

    filePickerEl = document.querySelector("#filePicker");

    document.title = this.appName;
      
    setTimeout(()=>{
      requestAnimationFrame(()=>{
        document.body.classList.remove("hidden");
      })
    },50)
  },
  methods: {
    read: function() {
      try {
        this.path = "";
        let newJson = JSON.parse(this.editor.getValue())
        if (Object.keys(newJson)[0] !== Object.keys(this.json)[0]) {
          this.close = !this.close
        }
          
        this.json = newJson;
        this.error = "";
      }
      catch(error) {
        this.error = `[EXPLICIT] ${error.name}: ${error.message}`;
      }
    },
    updatePath: function(newPath) {
      this.path = newPath;
    },
    copied: function () {
      M.toast({html:"Path copied!", classes: "rounded"})
    },
    editorPrettify: function (hideToast) {
      this.editor.setValue(JSON.stringify(JSON.parse(this.editor.getValue()),null,2));
      if (hideToast != true) M.toast({html:"Prettified!", classes: "rounded"});
    },
    editorMinify: function () {
      this.editor.setValue(JSON.stringify(JSON.parse(this.editor.getValue()),null,0));
      M.toast({html:"Minified!", classes: "rounded"});
    },
    editorTryToFix: function () {
      try {
        this.editor.setValue(JSON.stringify(eval(`var _json = ${this.editor.getValue()}; _json`),null,2));
        M.toast({html:"Successfully fixed!", classes: "rounded"});
      } catch (error) {
        M.toast({html:'<span style="color: #EF5858">Could not fix! :(</span>', classes: "rounded red-text"});
        this.error += `, ${error}`;
      }
    },
    setAPPName: function (name="") {
      if (name.replace(/ +/gm,"").toLowerCase() == "jsonpathfinder") {
        document.title = "Perish";
        this.appName = "Perish";
        return document.body.classList.add("hidden");
      }
      document.title = name;
      this.appName = name;
    },
    onTitleClick: function () {
      let newName = prompt("What do you want to make the new app name?", this.appName);
      this.setAPPName(newName || this.appName);
    },
    expandAll: function () {
      function __toggle(i=0) {
        document.querySelectorAll(".json-key .is-not-open").forEach((e)=>e.click());
        if (document.querySelectorAll(".json-key .is-not-open").length != 0) {
          setTimeout(()=>{__toggle(++i)},10)
        }
      }
      __toggle()
    },
    collapseAll: function () {
      document.querySelectorAll(".json-key .is-open").forEach((e)=>e.click());
    },
    openFile: function () {
      M.toast({html:"Opening file explorer!", classes: "rounded", displayLength: 1000});
      filePickerEl.click();
    },
    onFileInput: async function (e) {
      M.toast({html:"Reading file!", classes: "rounded", displayLength: 1000});
      let fileData = await e.target.files[0].text();
      this.editor.setValue(fileData);
    }
  },
  watch: {
    defaultPath: function (newVal, oldVal) {
      localStorage.setItem("pfj.defaultPath",newVal);
      this.defaultPath = this.defaultPath.replace(/ +/gm,"") || "$";
      this.path = "";
      this.read();
      this.collapseAll();
    },
    pathType: function (newVal, oldVal) {
      localStorage.setItem("pfj.pathType",newVal);
      this.path = "";
      this.read();
      this.collapseAll();
    }
  }
});


function getObjectName(object) {
  return Object.prototype.toString.call(object).slice(8,-1)
}

// create hub so components can communicate
let eventHub = new Vue();

// tree component for objects/arrays within the JSON
Vue.component("json-tree", {
  template: "#json-tree",
  props: [
    // object that this tree displays
    "thisJson",
    // the original json object (app.json)
    "originalJson",
    // root = false on all subtrees -- gives them margin: 0 0 0 25px
    "root",
    // whether this tree is open and displaying its contents
    "open",
    // whether the children of this tree are open
    "childOpen",
    // changes when the editor is changed, forcing the reader to collapse all subtrees
    "close"
  ],
  data: function() {
    return {
      // path to be displayed in the path bar
      path: "",
      // allow us to mutate open/closed state of subtrees
      isOpen: this.open,
      isChildOpen: this.childOpen
    };
  },
  methods: {
    // open and close subtree, update path display on click
    clicked: function(key) {
      this.selected = true;
      this.isChildOpen = !this.isChildOpen;
      this.path = this.searchObject(this.originalJson, this.thisJson, key);
      // send the updated path up the chain
      this.$emit("update", this.path);
    },
    searchObject: function(oldObj, newObj, key, path) {
      path = path || app.defaultPath;
      let output = "";
      let newPath;
      for (let item in oldObj) {
        // compare the keys and the objects themselves to find a match
        if (item.toString() === key.toString() && oldObj === newObj) {
          if (app.pathType == "js") {
            // put array indices in brackets
            if (Array.isArray(newObj)) {
              return `${path}[${item}]`;
              // put strings with spaces, periods, or brackets in brackets
            } else if (/[^A-Za-z0-9_$]/.test(item)) {
              return `${path}["${item}"]`;
              // use dot notation for all else
            } else {
              return `${path}.${item}`;
            }

          } else if (app.pathType == "py") {
            return `${path}["${item}"]`;
          }
        }
        else if (typeof oldObj[item] === "object") {
          if (app.pathType == "js") {
            if (Array.isArray(oldObj))
            newPath = `${path}[${item}]`;
            else if (/[^A-Za-z0-9_$]/.test(item))
              newPath = `${path}["${item}"]`;
            else
              newPath = `${path}.${item}`;
          } else if (app.pathType == "py") {
            newPath = `${path}["${item}"]`;
          }

          output = this.searchObject(oldObj[item], newObj, key, newPath) || output;
        }
      }
      return output;
    },
    // sends this message up the chain
    sendUpdate: function(path) {
      this.$emit("update", path);
    }
  },
  // app.close changes when new JSON is put into the editor, so collapse the reader
  watch: {
    close: function(newValue) {
      this.isChildOpen = false;
    }
  }
});

// component for each key within the JSON tree
Vue.component("json-key", {
  template: "#json-key",
  props: [
    "thisJson",
    "originalJson",
    "keyName",
    "item",
    "open",
    "childOpen",
    "close"
  ],
  data: function() {
    return {
      path: "",
      selected: false,
      justClicked: false,
      isChildOpen: this.childOpen,
      isOpen: this.open
    }
  },
  // use "other-clicked" event to deselect all other items in the tree; making sure only one item is selected at a time
  created: function() {
    eventHub.$on("other-clicked", this.deselect)
  },
  beforeDestroy: function() {
    eventHub.$off("other-clicked", this.deselect)
  },
  methods: {
    clicked: function(key) {
      this.isOpen = !this.isOpen;
      this.justClicked = true;
      this.selected = true;
      // tell the parent json-tree component to run searchObject() on this key
      this.$emit("check", key);
      eventHub.$emit("other-clicked");
      this.justClicked = false;
    },
    sendUpdate: function(path) {
      this.$emit("update", path);
    },
    // if this.justClicked is true, it means this item has just been clicked, so allow it to be selected; otherwise, deselect it
    deselect: function() {
      if (!this.justClicked)
        this.selected = false;
    }
  },
  // collapse the reader when editor JSON changes
  watch: {
    close: function(newValue) {
      this.isOpen = false;
    }
  }
});


