import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { MenuCode } from "./menu_code";

export interface PaginationOpts {
    itemsPerPage : number
    numClickablePages : number
}

export function getPageItems<T>(items : T[], pageIndex : number, opts : PaginationOpts) : T[] {
    return paginate<T>(items, pageIndex, opts).displayedItems;
}

export function getPageNumberBlurb<T>(items : T[], pageIndex : number, opts : PaginationOpts) : string {
    return `Page ${pageIndex+1} of ${totalPagesOf(items, opts)}`;
}

export function insertPageButtons<T>(options : CallbackButton[][], thisPageMenuCode : MenuCode, items : T[], requestedPageIndex : number, opts : PaginationOpts) {

    const totalPages = totalPagesOf(items, opts);
    const pageIndex = Math.max(0,Math.min(requestedPageIndex, totalPages - 1));
    const pagination = paginate<T>(items, pageIndex, opts);
    
    if (pagination.clickablePageIndices.length <= 1) {
        return;
    }

    const pagination_buttons : CallbackButton[] = [];

    // first button
    if (totalPages < 5) {
        pagination_buttons.push({
            text: "<<",
            callback_data: new CallbackData(thisPageMenuCode, (0).toString(10)).toString()
        });
    }

    // back button
    pagination_buttons.push({
      text: "<",
      callback_data: new CallbackData(thisPageMenuCode, Math.max(0,pageIndex-1).toString(10)).toString() 
    });

    // numbered page buttons
    for (const buttonPageIndex of pagination.clickablePageIndices) {
        const pageButtonCallbackData = new CallbackData(thisPageMenuCode, buttonPageIndex.toString(10));
        const prefix = totalPagesOf(items, opts) <= 3 ? "Pg. " : "";
        const pageButton : CallbackButton = {
            text: indicateIfIsCurrentPage(prefix + (buttonPageIndex + 1).toString(),buttonPageIndex,pageIndex),
            callback_data: pageButtonCallbackData.toString()
        };
        pagination_buttons.push(pageButton);
    }

    // next button
    pagination_buttons.push({
        text: ">",
        callback_data: new CallbackData(thisPageMenuCode, Math.min(totalPages - 1,pageIndex+1).toString(10)).toString() 
    });

    // last button
    if (totalPages < 5) {
        pagination_buttons.push({
            text: ">>",
            callback_data: new CallbackData(thisPageMenuCode, (totalPages-1).toString()).toString()
        });
    }


    options.push(pagination_buttons);
}

interface Pagination<T> {
    displayedItems : T[]
    clickablePageIndices : number[]
}

function paginate<T>(items : T[], requestedPageIndex : number, opts : PaginationOpts) : Pagination<T> {
    
    // get the items for the requested page (or the last page, if requested page is out of bounds)
    const totalPages = totalPagesOf(items, opts);
    const pageIndex = Math.max(0,Math.min(requestedPageIndex, totalPages-1));
    const itemStartIndex = opts.itemsPerPage * pageIndex;
    const displayedItems = items.slice(itemStartIndex, itemStartIndex + opts.itemsPerPage);
    
    
    // calculate a 'sliding window' of clickable pages around the current page
    let minPageIndex = Math.max(0, pageIndex - Math.floor(opts.numClickablePages/2));
    let maxPageIndex = minPageIndex + opts.numClickablePages;
    if (maxPageIndex > totalPages - 1) {
        minPageIndex = Math.max(0, (totalPages - 1) - opts.numClickablePages);
        maxPageIndex = totalPages - 1;    
    }
    const pageIndices = Array.from({ length: maxPageIndex - minPageIndex + 1 }, (_, i) => minPageIndex + i);
    
    // return both
    return { displayedItems, clickablePageIndices: pageIndices };
}

function totalPagesOf<T>(items : T[], opts : PaginationOpts) : number {
    return Math.ceil(items.length / opts.itemsPerPage);
}

function indicateIfIsCurrentPage(text: string, index : number, pageIndex : number) : string {
    if (index === pageIndex) {
        return `>${text}<`;
    }
    else {
        return text;
    }
}
