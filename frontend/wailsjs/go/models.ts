export namespace main {
	
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

