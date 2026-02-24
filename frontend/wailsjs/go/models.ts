export namespace main {
	
	export class ConnectionTestResult {
	    success: boolean;
	    code: string;
	    message: string;
	    gpuCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.code = source["code"];
	        this.message = source["message"];
	        this.gpuCount = source["gpuCount"];
	    }
	}
	export class SSHConfigConnection {
	    name: string;
	    target: string;
	    port: number;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHConfigConnection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.target = source["target"];
	        this.port = source["port"];
	        this.source = source["source"];
	    }
	}
	export class UpdateInfo {
	    available: boolean;
	    latest: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.latest = source["latest"];
	        this.url = source["url"];
	    }
	}

}

